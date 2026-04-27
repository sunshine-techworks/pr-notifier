import type {
  Notification,
  NotificationService,
  PrThread,
  PrThreadDao,
  SlackClient,
  SlackClientFactory,
  User,
  UserDao,
} from '@pr-notify/core'
import { DEFAULT_PREFERENCES } from '@pr-notify/core'
import type { SQSEvent } from 'aws-lambda'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Inline fixtures rather than importing from @pr-notify/core/testing -- the
// testing subpath is built output, and we want the test to run independently
// of build ordering.
function createTestUser(overrides?: Partial<User>): User {
  const now = new Date().toISOString()
  return {
    slackUserId: 'U12345678',
    slackWorkspaceId: 'W12345678',
    githubUsername: 'testuser',
    preferences: { ...DEFAULT_PREFERENCES },
    digestEnabled: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function createTestNotification(overrides?: Partial<Notification>): Notification {
  return {
    id: 'notif-12345',
    type: 'review_requested',
    targetSlackUserId: 'U12345678',
    targetWorkspaceId: 'W12345678',
    actorGithubUsername: 'reviewer',
    actorAvatarUrl: 'https://avatars.githubusercontent.com/u/123?v=4',
    actorIsBot: false,
    prNumber: 42,
    prTitle: 'Add new feature',
    prUrl: 'https://github.com/owner/repo/pull/42',
    repository: 'owner/repo',
    headRef: 'feature-branch',
    baseRef: 'main',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

// Mocks for @pr-notify/core implementations and the metrics emitter must be
// hoisted so the handler module under test picks them up at import time.
const mocks = vi.hoisted(() => {
  const userDao = {
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findByGithubUsername: vi.fn(),
    findByWorkspaceId: vi.fn(),
    countByWorkspaceId: vi.fn(),
  }
  const prThreadDao = {
    findThread: vi.fn(),
    createThread: vi.fn(),
  }
  const slackClient = {
    sendDirectMessage: vi.fn(),
    sendChannelMessage: vi.fn(),
    updateMessage: vi.fn(),
    getUserInfo: vi.fn(),
    publishAppHome: vi.fn(),
    verifySignature: vi.fn(),
  }
  const slackClientFactory = {
    getClientForWorkspace: vi.fn().mockResolvedValue(slackClient),
  }
  const notificationService = {
    shouldNotify: vi.fn().mockReturnValue(true),
    buildSlackBlocks: vi.fn().mockReturnValue([]),
    createReviewRequestNotification: vi.fn(),
    createReviewSubmittedNotification: vi.fn(),
    createMentionNotification: vi.fn(),
    createCommentNotification: vi.fn(),
  }
  const emitMetric = vi.fn()
  return {
    userDao,
    prThreadDao,
    slackClient,
    slackClientFactory,
    notificationService,
    emitMetric,
  }
})

// Pull through real exports (types, schemas, DEFAULT_PREFERENCES) and override
// only the implementation classes the handler instantiates at module load.
vi.mock('@pr-notify/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pr-notify/core')>()
  return {
    ...actual,
    ConsoleLogger: class {
      info = vi.fn()
      warn = vi.fn()
      error = vi.fn()
      debug = vi.fn()
      child = vi.fn().mockReturnThis()
    },
    UserDaoImpl: vi.fn().mockImplementation(() => mocks.userDao),
    WorkspaceDaoImpl: vi.fn(),
    PrThreadDaoImpl: vi.fn().mockImplementation(() => mocks.prThreadDao),
    WorkspaceServiceImpl: vi.fn(),
    NotificationServiceImpl: vi.fn().mockImplementation(() => mocks.notificationService),
    SlackClientFactoryImpl: vi.fn().mockImplementation(() => mocks.slackClientFactory),
  }
})

vi.mock('../shared/metrics', () => ({
  emitMetric: mocks.emitMetric,
}))

// Aws SDK constructors are unused in tests but invoked at module load
vi.mock('@aws-sdk/client-dynamodb', () => ({ DynamoDBClient: vi.fn() }))
vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: vi.fn() },
}))

// Reference typed views of the hoisted mocks for nicer assertions
const userDao = mocks.userDao satisfies UserDao
const prThreadDao = mocks.prThreadDao satisfies PrThreadDao
const slackClient = mocks.slackClient satisfies SlackClient
const slackClientFactory = mocks.slackClientFactory satisfies Omit<
  SlackClientFactory,
  never
>
const notificationService = mocks.notificationService satisfies NotificationService
const emitMetric = mocks.emitMetric

function buildSqsEvent(body: object): SQSEvent {
  return {
    Records: [
      {
        messageId: 'm-1',
        receiptHandle: 'rh',
        body: JSON.stringify(body),
        attributes: {
          ApproximateReceiveCount: '1',
          SentTimestamp: '0',
          SenderId: 's',
          ApproximateFirstReceiveTimestamp: '0',
        },
        messageAttributes: {},
        md5OfBody: '',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn',
        awsRegion: 'us-east-1',
      },
    ],
  }
}

describe('notification-processor handler', () => {
  let handler: (event: SQSEvent) => Promise<void>

  beforeEach(async () => {
    vi.clearAllMocks()

    // Default happy-path stubs reset every test
    userDao.findById.mockResolvedValue(createTestUser())
    notificationService.shouldNotify.mockReturnValue(true)
    notificationService.buildSlackBlocks.mockReturnValue([])
    slackClientFactory.getClientForWorkspace.mockResolvedValue(slackClient)
    slackClient.sendDirectMessage.mockResolvedValue({
      ok: true,
      ts: '1700000000.000100',
      channel: 'D_DM_1',
    })
    prThreadDao.findThread.mockResolvedValue(null)
    prThreadDao.createThread.mockResolvedValue({ created: true })

    // Re-import the handler after every reset so mocks are fresh
    vi.resetModules()
    const mod = await import('./handler')
    handler = mod.handler
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('posts top-level and records the parent when no thread exists', async () => {
    // The handler keys the thread lookup off the looked-up user record, so
    // both the user and notification fixtures must agree on slackUserId.
    userDao.findById.mockResolvedValue(createTestUser({ slackUserId: 'U1' }))
    const notification = createTestNotification({
      targetSlackUserId: 'U1',
      repository: 'octo/widgets',
      prNumber: 42,
    })

    await handler(buildSqsEvent(notification))

    // findThread was the lookup; createThread persisted the parent
    expect(prThreadDao.findThread).toHaveBeenCalledWith('U1', 'octo/widgets', 42)
    expect(prThreadDao.createThread).toHaveBeenCalledTimes(1)
    const created = prThreadDao.createThread.mock.calls[0][0]
    expect(created).toMatchObject({
      slackUserId: 'U1',
      repository: 'octo/widgets',
      prNumber: 42,
      channelId: 'D_DM_1',
      threadTs: '1700000000.000100',
    })

    // Slack message had no thread_ts on the wire
    const sentMessage = slackClient.sendDirectMessage.mock.calls[0][1]
    expect(sentMessage.threadTs).toBeUndefined()

    // Threaded=false metric emitted, no race metric
    expect(emitMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        metricName: 'NotificationsThreaded',
        dimensions: { Threaded: 'false' },
      }),
    )
    expect(emitMetric).not.toHaveBeenCalledWith(
      expect.objectContaining({ metricName: 'PrThreadRaceDetected' }),
    )
  })

  it('posts as a threaded reply and skips the createThread write when a parent exists', async () => {
    userDao.findById.mockResolvedValue(createTestUser({ slackUserId: 'U1' }))
    const existing: PrThread = {
      slackUserId: 'U1',
      repository: 'octo/widgets',
      prNumber: 42,
      channelId: 'D_DM_1',
      threadTs: '1699000000.000050',
      createdAt: new Date().toISOString(),
    }
    prThreadDao.findThread.mockResolvedValue(existing)

    const notification = createTestNotification({
      targetSlackUserId: 'U1',
      repository: 'octo/widgets',
      prNumber: 42,
    })

    await handler(buildSqsEvent(notification))

    const sentMessage = slackClient.sendDirectMessage.mock.calls[0][1]
    expect(sentMessage.threadTs).toBe('1699000000.000050')

    // Already-recorded parent must not be re-written
    expect(prThreadDao.createThread).not.toHaveBeenCalled()

    expect(emitMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        metricName: 'NotificationsThreaded',
        dimensions: { Threaded: 'true' },
      }),
    )
  })

  it('emits PrThreadRaceDetected when a concurrent writer wins the conditional create', async () => {
    prThreadDao.createThread.mockResolvedValue({ created: false })

    await handler(buildSqsEvent(createTestNotification()))

    expect(emitMetric).toHaveBeenCalledWith(
      expect.objectContaining({ metricName: 'PrThreadRaceDetected', value: 1 }),
    )
  })
})
