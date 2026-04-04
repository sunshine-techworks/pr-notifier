import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Logger } from '../interfaces/logger'
import type { NotificationQueue } from '../interfaces/notification-queue'
import type { NotificationService } from '../interfaces/notification-service'
import type { UserDao } from '../interfaces/user-dao'
import type {
  GitHubComment,
  GitHubPullRequest,
  GitHubRepository,
  GitHubUser,
  IssueCommentEvent,
  PullRequestEvent,
  PullRequestReviewCommentEvent,
  PullRequestReviewEvent,
} from '../types/github-webhook.types'
import {
  createMockLogger,
  createMockNotificationQueue,
  createMockNotificationService,
  createMockUserDao,
  createTestNotification,
  createTestUser,
} from '../testing/index'

import { extractMentions } from './mention-parser'
import { WebhookProcessorImpl } from './webhook-processor-impl'

// --- Payload factories (local to this test file) ---

function createGitHubUser(overrides: Partial<GitHubUser> = {}): GitHubUser {
  return {
    login: 'sender-user',
    id: 1,
    avatar_url: 'https://avatars.github.com/sender',
    html_url: 'https://github.com/sender-user',
    type: 'User',
    ...overrides,
  }
}

function createGitHubPR(overrides: Partial<GitHubPullRequest> = {}): GitHubPullRequest {
  return {
    number: 42,
    title: 'Add awesome feature',
    html_url: 'https://github.com/org/repo/pull/42',
    state: 'open',
    draft: false,
    user: createGitHubUser({ login: 'pr-author', id: 2 }),
    head: { ref: 'feature-branch', sha: 'abc123' },
    base: { ref: 'main', sha: 'def456' },
    body: 'PR description',
    ...overrides,
  }
}

function createGitHubRepo(overrides: Partial<GitHubRepository> = {}): GitHubRepository {
  return {
    id: 100,
    name: 'repo',
    full_name: 'org/repo',
    html_url: 'https://github.com/org/repo',
    owner: createGitHubUser({ login: 'org' }),
    ...overrides,
  }
}

function createGitHubComment(overrides: Partial<GitHubComment> = {}): GitHubComment {
  return {
    id: 500,
    user: createGitHubUser(),
    body: 'Looks good to me!',
    html_url: 'https://github.com/org/repo/pull/42#comment-500',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    ...overrides,
  }
}

function createPullRequestEvent(
  overrides: Partial<PullRequestEvent> = {},
): PullRequestEvent {
  return {
    action: 'review_requested',
    pull_request: createGitHubPR(),
    repository: createGitHubRepo(),
    sender: createGitHubUser(),
    requested_reviewer: createGitHubUser({ login: 'reviewer-user', id: 3 }),
    ...overrides,
  }
}

function createPullRequestReviewEvent(
  overrides: Partial<PullRequestReviewEvent> = {},
): PullRequestReviewEvent {
  return {
    action: 'submitted',
    review: {
      id: 200,
      user: createGitHubUser(),
      body: 'LGTM',
      state: 'approved',
      html_url: 'https://github.com/org/repo/pull/42#pullrequestreview-200',
      submitted_at: '2024-01-15T10:00:00Z',
    },
    pull_request: createGitHubPR(),
    repository: createGitHubRepo(),
    sender: createGitHubUser(),
    ...overrides,
  }
}

function createPullRequestReviewCommentEvent(
  overrides: Partial<PullRequestReviewCommentEvent> = {},
): PullRequestReviewCommentEvent {
  return {
    action: 'created',
    comment: createGitHubComment(),
    pull_request: createGitHubPR(),
    repository: createGitHubRepo(),
    sender: createGitHubUser(),
    ...overrides,
  }
}

function createIssueCommentEvent(
  overrides: Partial<IssueCommentEvent> = {},
): IssueCommentEvent {
  return {
    action: 'created',
    comment: createGitHubComment(),
    issue: {
      number: 42,
      title: 'Add awesome feature',
      html_url: 'https://github.com/org/repo/pull/42',
      user: createGitHubUser({ login: 'pr-author', id: 2 }),
      pull_request: { url: 'https://api.github.com/repos/org/repo/pulls/42' },
    },
    repository: createGitHubRepo(),
    sender: createGitHubUser(),
    ...overrides,
  }
}

// --- Test suite ---

describe('WebhookProcessorImpl', () => {
  let mockUserDao: UserDao
  let mockNotificationService: NotificationService
  let mockNotificationQueue: NotificationQueue
  let mockLogger: Logger
  let processor: WebhookProcessorImpl

  beforeEach(() => {
    vi.clearAllMocks()
    mockUserDao = createMockUserDao()
    mockNotificationService = createMockNotificationService()
    mockNotificationQueue = createMockNotificationQueue()
    mockLogger = createMockLogger()
    processor = new WebhookProcessorImpl(
      mockUserDao,
      mockNotificationService,
      mockNotificationQueue,
      mockLogger,
    )

    // Default: shouldNotify allows all notifications
    vi.mocked(mockNotificationService.shouldNotify).mockReturnValue(true)
    // Default: create methods return a test notification
    vi.mocked(mockNotificationService.createReviewRequestNotification)
      .mockReturnValue(createTestNotification({ type: 'review_requested' }))
    vi.mocked(mockNotificationService.createReviewSubmittedNotification)
      .mockReturnValue(createTestNotification({ type: 'review_submitted' }))
    vi.mocked(mockNotificationService.createCommentNotification)
      .mockReturnValue(createTestNotification({ type: 'comment' }))
    vi.mocked(mockNotificationService.createMentionNotification)
      .mockReturnValue(createTestNotification({ type: 'mention' }))
  })

  describe('processPullRequestEvent', () => {
    it('sends notification when review_requested and reviewer is registered', async () => {
      const targetUser = createTestUser({ githubUsername: 'reviewer-user' })
      vi.mocked(mockUserDao.findByGithubUsername).mockResolvedValue(targetUser)

      const result = await processor.processPullRequestEvent(createPullRequestEvent())

      expect(result.notificationsSent).toBe(1)
      expect(result.skipped).toHaveLength(0)
      expect(mockNotificationQueue.send).toHaveBeenCalledOnce()
      expect(mockNotificationService.createReviewRequestNotification).toHaveBeenCalledOnce()
    })

    it('skips with user_not_found when reviewer is not registered', async () => {
      vi.mocked(mockUserDao.findByGithubUsername).mockResolvedValue(null)

      const result = await processor.processPullRequestEvent(createPullRequestEvent())

      expect(result.notificationsSent).toBe(0)
      expect(result.skipped).toHaveLength(1)
      expect(result.skipped[0].reason).toBe('user_not_found')
      expect(result.skipped[0].username).toBe('reviewer-user')
      expect(mockNotificationQueue.send).not.toHaveBeenCalled()
    })

    it('skips with self_notification when sender requests their own review', async () => {
      const selfReviewPayload = createPullRequestEvent({
        sender: createGitHubUser({ login: 'same-user' }),
        requested_reviewer: createGitHubUser({ login: 'same-user' }),
      })
      vi.mocked(mockUserDao.findByGithubUsername)
        .mockResolvedValue(createTestUser({ githubUsername: 'same-user' }))

      const result = await processor.processPullRequestEvent(selfReviewPayload)

      expect(result.notificationsSent).toBe(0)
      expect(result.skipped[0].reason).toBe('self_notification')
      expect(mockNotificationQueue.send).not.toHaveBeenCalled()
    })

    it('skips with preference_disabled when user has reviewRequests off', async () => {
      vi.mocked(mockUserDao.findByGithubUsername)
        .mockResolvedValue(createTestUser({ githubUsername: 'reviewer-user' }))
      vi.mocked(mockNotificationService.shouldNotify).mockReturnValue(false)

      const result = await processor.processPullRequestEvent(createPullRequestEvent())

      expect(result.notificationsSent).toBe(0)
      expect(result.skipped[0].reason).toBe('preference_disabled')
    })

    it('skips with unsupported_action for non-review_requested actions', async () => {
      const payload = createPullRequestEvent({ action: 'opened' })

      const result = await processor.processPullRequestEvent(payload)

      expect(result.notificationsSent).toBe(0)
      expect(result.skipped[0].reason).toBe('unsupported_action')
      expect(result.skipped[0].action).toBe('opened')
      expect(mockUserDao.findByGithubUsername).not.toHaveBeenCalled()
    })

    it('returns empty result for team review requests without requested_reviewer', async () => {
      const payload = createPullRequestEvent({ requested_reviewer: undefined })

      const result = await processor.processPullRequestEvent(payload)

      expect(result.notificationsSent).toBe(0)
      expect(result.skipped).toHaveLength(0)
    })

    it('performs case-insensitive self-notification check', async () => {
      const payload = createPullRequestEvent({
        sender: createGitHubUser({ login: 'UserName' }),
        requested_reviewer: createGitHubUser({ login: 'username' }),
      })
      vi.mocked(mockUserDao.findByGithubUsername)
        .mockResolvedValue(createTestUser({ githubUsername: 'username' }))

      const result = await processor.processPullRequestEvent(payload)

      expect(result.skipped[0].reason).toBe('self_notification')
    })
  })

  describe('processPullRequestReviewEvent', () => {
    it('sends notification for approved review to PR author', async () => {
      const targetUser = createTestUser({ githubUsername: 'pr-author' })
      vi.mocked(mockUserDao.findByGithubUsername).mockResolvedValue(targetUser)

      const result = await processor.processPullRequestReviewEvent(
        createPullRequestReviewEvent(),
      )

      expect(result.notificationsSent).toBe(1)
      expect(mockNotificationService.createReviewSubmittedNotification).toHaveBeenCalledWith(
        expect.objectContaining({ reviewState: 'approved' }),
      )
    })

    it('passes changes_requested reviewState correctly', async () => {
      vi.mocked(mockUserDao.findByGithubUsername)
        .mockResolvedValue(createTestUser({ githubUsername: 'pr-author' }))
      const payload = createPullRequestReviewEvent({
        review: {
          id: 200,
          user: createGitHubUser(),
          body: 'Needs work',
          state: 'changes_requested',
          html_url: 'https://github.com/org/repo/pull/42#pullrequestreview-200',
          submitted_at: '2024-01-15T10:00:00Z',
        },
      })

      await processor.processPullRequestReviewEvent(payload)

      expect(mockNotificationService.createReviewSubmittedNotification).toHaveBeenCalledWith(
        expect.objectContaining({ reviewState: 'changes_requested' }),
      )
    })

    it('passes commented reviewState correctly', async () => {
      vi.mocked(mockUserDao.findByGithubUsername)
        .mockResolvedValue(createTestUser({ githubUsername: 'pr-author' }))
      const payload = createPullRequestReviewEvent({
        review: {
          id: 200,
          user: createGitHubUser(),
          body: 'Question about this',
          state: 'commented',
          html_url: 'https://github.com/org/repo/pull/42#pullrequestreview-200',
          submitted_at: '2024-01-15T10:00:00Z',
        },
      })

      await processor.processPullRequestReviewEvent(payload)

      expect(mockNotificationService.createReviewSubmittedNotification).toHaveBeenCalledWith(
        expect.objectContaining({ reviewState: 'commented' }),
      )
    })

    it('skips dismissed review state', async () => {
      const payload = createPullRequestReviewEvent({
        review: {
          id: 200,
          user: createGitHubUser(),
          body: null,
          state: 'dismissed',
          html_url: 'https://github.com/org/repo/pull/42#pullrequestreview-200',
          submitted_at: '2024-01-15T10:00:00Z',
        },
      })

      const result = await processor.processPullRequestReviewEvent(payload)

      expect(result.notificationsSent).toBe(0)
      expect(result.skipped[0].reason).toBe('unsupported_action')
      expect(result.skipped[0].details).toContain('dismissed')
    })

    it('skips pending review state', async () => {
      const payload = createPullRequestReviewEvent({
        review: {
          id: 200,
          user: createGitHubUser(),
          body: null,
          state: 'pending',
          html_url: 'https://github.com/org/repo/pull/42#pullrequestreview-200',
          submitted_at: '2024-01-15T10:00:00Z',
        },
      })

      const result = await processor.processPullRequestReviewEvent(payload)

      expect(result.skipped[0].details).toContain('pending')
    })

    it('skips self-review when sender is the PR author', async () => {
      const authorUser = createGitHubUser({ login: 'pr-author' })
      const payload = createPullRequestReviewEvent({ sender: authorUser })
      vi.mocked(mockUserDao.findByGithubUsername)
        .mockResolvedValue(createTestUser({ githubUsername: 'pr-author' }))

      const result = await processor.processPullRequestReviewEvent(payload)

      expect(result.skipped[0].reason).toBe('self_notification')
    })

    it('skips unsupported_action for non-submitted actions', async () => {
      const payload = createPullRequestReviewEvent({ action: 'edited' })

      const result = await processor.processPullRequestReviewEvent(payload)

      expect(result.skipped[0].reason).toBe('unsupported_action')
      expect(result.skipped[0].action).toBe('edited')
    })

    it('sets actorIsBot true when sender type is Bot', async () => {
      const botSender = createGitHubUser({ login: 'dependabot[bot]', type: 'Bot' })
      const payload = createPullRequestReviewEvent({ sender: botSender })
      vi.mocked(mockUserDao.findByGithubUsername)
        .mockResolvedValue(createTestUser({ githubUsername: 'pr-author' }))

      await processor.processPullRequestReviewEvent(payload)

      expect(mockNotificationService.shouldNotify).toHaveBeenCalledWith(
        expect.anything(),
        'review_submitted',
        true,
      )
    })
  })

  describe('processPullRequestReviewCommentEvent', () => {
    it('sends comment notification to PR author', async () => {
      vi.mocked(mockUserDao.findByGithubUsername)
        .mockResolvedValue(createTestUser({ githubUsername: 'pr-author' }))

      const result = await processor.processPullRequestReviewCommentEvent(
        createPullRequestReviewCommentEvent(),
      )

      expect(result.notificationsSent).toBe(1)
      expect(mockNotificationService.createCommentNotification).toHaveBeenCalledOnce()
    })

    it('sends mention notification to @mentioned users', async () => {
      const comment = createGitHubComment({ body: 'Hey @mentioned-user, what do you think?' })
      const payload = createPullRequestReviewCommentEvent({ comment })

      // First call for PR author, second for mentioned user
      vi.mocked(mockUserDao.findByGithubUsername)
        .mockResolvedValueOnce(createTestUser({ githubUsername: 'pr-author' }))
        .mockResolvedValueOnce(createTestUser({ githubUsername: 'mentioned-user' }))

      const result = await processor.processPullRequestReviewCommentEvent(payload)

      expect(result.notificationsSent).toBe(2)
      expect(mockNotificationService.createCommentNotification).toHaveBeenCalledOnce()
      expect(mockNotificationService.createMentionNotification).toHaveBeenCalledOnce()
    })

    it('does not send duplicate mention notification to PR author', async () => {
      // Comment mentions the PR author — they should only get the comment notification
      const comment = createGitHubComment({ body: 'Hey @pr-author, I fixed the issue' })
      const payload = createPullRequestReviewCommentEvent({ comment })
      vi.mocked(mockUserDao.findByGithubUsername)
        .mockResolvedValue(createTestUser({ githubUsername: 'pr-author' }))

      const result = await processor.processPullRequestReviewCommentEvent(payload)

      // Only 1 notification (comment to author), not 2 (comment + mention)
      expect(result.notificationsSent).toBe(1)
      expect(mockNotificationService.createCommentNotification).toHaveBeenCalledOnce()
      expect(mockNotificationService.createMentionNotification).not.toHaveBeenCalled()
    })

    it('skips sender from both comment and mention notifications', async () => {
      // Sender is the PR author and also mentions themselves
      const sender = createGitHubUser({ login: 'pr-author' })
      const comment = createGitHubComment({ body: 'Note to self @pr-author' })
      const pr = createGitHubPR({ user: sender })
      const payload = createPullRequestReviewCommentEvent({ sender, comment, pull_request: pr })
      vi.mocked(mockUserDao.findByGithubUsername)
        .mockResolvedValue(createTestUser({ githubUsername: 'pr-author' }))

      const result = await processor.processPullRequestReviewCommentEvent(payload)

      // Self-notification skipped for comment, mention filtered out as sender
      expect(result.notificationsSent).toBe(0)
      expect(result.skipped[0].reason).toBe('self_notification')
    })

    it('aggregates results from PR author and mentioned users', async () => {
      const comment = createGitHubComment({ body: 'cc @user-a @unknown-user' })
      const payload = createPullRequestReviewCommentEvent({ comment })

      vi.mocked(mockUserDao.findByGithubUsername)
        .mockResolvedValueOnce(createTestUser({ githubUsername: 'pr-author' })) // author found
        .mockResolvedValueOnce(createTestUser({ githubUsername: 'user-a' })) // user-a found
        .mockResolvedValueOnce(null) // unknown-user not found

      const result = await processor.processPullRequestReviewCommentEvent(payload)

      expect(result.notificationsSent).toBe(2)
      expect(result.skipped).toHaveLength(1)
      expect(result.skipped[0].reason).toBe('user_not_found')
      expect(result.skipped[0].username).toBe('unknown-user')
    })

    it('skips unsupported actions like edited and deleted', async () => {
      const editedPayload = createPullRequestReviewCommentEvent({ action: 'edited' })
      const deletedPayload = createPullRequestReviewCommentEvent({ action: 'deleted' })

      const editedResult = await processor.processPullRequestReviewCommentEvent(editedPayload)
      const deletedResult = await processor.processPullRequestReviewCommentEvent(deletedPayload)

      expect(editedResult.skipped[0].reason).toBe('unsupported_action')
      expect(deletedResult.skipped[0].reason).toBe('unsupported_action')
    })
  })

  describe('processIssueCommentEvent', () => {
    it('skips with not_a_pr_comment when issue has no pull_request field', async () => {
      const payload = createIssueCommentEvent({
        issue: {
          number: 42,
          title: 'Bug report',
          html_url: 'https://github.com/org/repo/issues/42',
          user: createGitHubUser({ login: 'issue-author' }),
          pull_request: undefined,
        },
      })

      const result = await processor.processIssueCommentEvent(payload)

      expect(result.notificationsSent).toBe(0)
      expect(result.skipped[0].reason).toBe('not_a_pr_comment')
      expect(mockUserDao.findByGithubUsername).not.toHaveBeenCalled()
    })

    it('sends comment notification for PR comments', async () => {
      vi.mocked(mockUserDao.findByGithubUsername)
        .mockResolvedValue(createTestUser({ githubUsername: 'pr-author' }))

      const result = await processor.processIssueCommentEvent(createIssueCommentEvent())

      expect(result.notificationsSent).toBe(1)
      expect(mockNotificationService.createCommentNotification).toHaveBeenCalledOnce()
    })

    it('sends mention notifications for @mentioned users in PR comments', async () => {
      const comment = createGitHubComment({ body: 'Thoughts @other-dev?' })
      const payload = createIssueCommentEvent({ comment })

      vi.mocked(mockUserDao.findByGithubUsername)
        .mockResolvedValueOnce(createTestUser({ githubUsername: 'pr-author' }))
        .mockResolvedValueOnce(createTestUser({ githubUsername: 'other-dev' }))

      const result = await processor.processIssueCommentEvent(payload)

      expect(result.notificationsSent).toBe(2)
      expect(mockNotificationService.createMentionNotification).toHaveBeenCalledOnce()
    })

    it('uses empty strings for headRef and baseRef', async () => {
      vi.mocked(mockUserDao.findByGithubUsername)
        .mockResolvedValue(createTestUser({ githubUsername: 'pr-author' }))

      await processor.processIssueCommentEvent(createIssueCommentEvent())

      expect(mockNotificationService.createCommentNotification).toHaveBeenCalledWith(
        expect.objectContaining({ headRef: '', baseRef: '' }),
      )
    })

    it('skips unsupported actions', async () => {
      const payload = createIssueCommentEvent({ action: 'deleted' })

      const result = await processor.processIssueCommentEvent(payload)

      expect(result.skipped[0].reason).toBe('unsupported_action')
    })
  })

  describe('bot detection', () => {
    it('detects bot by sender.type === Bot', async () => {
      const botSender = createGitHubUser({ login: 'codecov', type: 'Bot' })
      const payload = createPullRequestReviewCommentEvent({
        sender: botSender,
        comment: createGitHubComment({ user: botSender }),
      })
      vi.mocked(mockUserDao.findByGithubUsername)
        .mockResolvedValue(createTestUser({ githubUsername: 'pr-author' }))

      await processor.processPullRequestReviewCommentEvent(payload)

      expect(mockNotificationService.shouldNotify).toHaveBeenCalledWith(
        expect.anything(),
        'comment',
        true,
      )
    })

    it('detects bot by [bot] suffix in login', async () => {
      const botSender = createGitHubUser({ login: 'dependabot[bot]', type: 'User' })
      const payload = createPullRequestEvent({
        sender: botSender,
        requested_reviewer: createGitHubUser({ login: 'reviewer-user' }),
      })
      vi.mocked(mockUserDao.findByGithubUsername)
        .mockResolvedValue(createTestUser({ githubUsername: 'reviewer-user' }))

      await processor.processPullRequestEvent(payload)

      expect(mockNotificationService.shouldNotify).toHaveBeenCalledWith(
        expect.anything(),
        'review_requested',
        true,
      )
    })

    it('identifies human users correctly', async () => {
      const humanSender = createGitHubUser({ login: 'real-human', type: 'User' })
      const payload = createPullRequestEvent({
        sender: humanSender,
        requested_reviewer: createGitHubUser({ login: 'reviewer-user' }),
      })
      vi.mocked(mockUserDao.findByGithubUsername)
        .mockResolvedValue(createTestUser({ githubUsername: 'reviewer-user' }))

      await processor.processPullRequestEvent(payload)

      expect(mockNotificationService.shouldNotify).toHaveBeenCalledWith(
        expect.anything(),
        'review_requested',
        false,
      )
    })
  })
})

describe('extractMentions', () => {
  it('extracts a single mention', () => {
    expect(extractMentions('Hey @alice, can you review?')).toEqual(['alice'])
  })

  it('extracts multiple mentions', () => {
    expect(extractMentions('@alice @bob please look')).toEqual(['alice', 'bob'])
  })

  it('deduplicates mentions', () => {
    expect(extractMentions('@alice @alice duplicate')).toEqual(['alice'])
  })

  it('lowercases mentions', () => {
    expect(extractMentions('cc @Alice @BOB')).toEqual(['alice', 'bob'])
  })

  it('does not match email addresses', () => {
    expect(extractMentions('email user@address.com')).toEqual([])
  })

  it('returns empty array when no mentions', () => {
    expect(extractMentions('no mentions here')).toEqual([])
  })

  it('supports hyphens in usernames', () => {
    expect(extractMentions('@hyphen-user works')).toEqual(['hyphen-user'])
  })

  it('matches mentions at start of line', () => {
    expect(extractMentions('@newline start')).toEqual(['newline'])
  })

  it('matches mentions after newlines', () => {
    expect(extractMentions('first line\n@second-line mention')).toEqual(['second-line'])
  })

  it('filters out false positives like @here, @all, @channel, @everyone', () => {
    expect(extractMentions('@here @all @channel @everyone')).toEqual([])
  })

  it('matches mentions after parentheses', () => {
    expect(extractMentions('(@alice) thoughts?')).toEqual(['alice'])
  })
})