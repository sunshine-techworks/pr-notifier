import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import {
  ConsoleLogger,
  type Notification,
  NotificationServiceImpl,
  PrThreadDaoImpl,
  SlackClientFactoryImpl,
  UserDaoImpl,
  WorkspaceDaoImpl,
  WorkspaceServiceImpl,
} from '@pr-notify/core'
import type { SQSEvent, SQSRecord } from 'aws-lambda'

import { emitMetric } from '../shared/metrics'

const USERS_TABLE_NAME = process.env['USERS_TABLE_NAME'] ?? ''
const WORKSPACES_TABLE_NAME = process.env['WORKSPACES_TABLE_NAME'] ?? ''
const PR_THREADS_TABLE_NAME = process.env['PR_THREADS_TABLE_NAME'] ?? ''
const SLACK_SIGNING_SECRET = process.env['SLACK_SIGNING_SECRET'] ?? ''
// Fallback token for backward compatibility during migration
const SLACK_BOT_TOKEN = process.env['SLACK_BOT_TOKEN'] ?? ''

const dynamoClient = new DynamoDBClient({})
const docClient = DynamoDBDocumentClient.from(dynamoClient)

const userDao = new UserDaoImpl(docClient, USERS_TABLE_NAME)
const workspaceDao = new WorkspaceDaoImpl(docClient, WORKSPACES_TABLE_NAME)
const prThreadDao = new PrThreadDaoImpl(docClient, PR_THREADS_TABLE_NAME)
const workspaceService = new WorkspaceServiceImpl(workspaceDao)
const notificationService = new NotificationServiceImpl()
const slackClientFactory = new SlackClientFactoryImpl(
  workspaceService,
  SLACK_SIGNING_SECRET,
  SLACK_BOT_TOKEN || undefined,
)
const logger = new ConsoleLogger()

/**
 * Lambda handler for processing notifications from SQS.
 * Looks up user, checks preferences, resolves the workspace-specific
 * Slack client, and sends the DM.
 */
export async function handler(event: SQSEvent): Promise<void> {
  const results = await Promise.allSettled(
    event.Records.map(processRecord),
  )

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      logger.error(`Failed to process record ${index}`, { error: result.reason })
    }
  })

  const failures = results.filter((r) => r.status === 'rejected')
  if (failures.length > 0) {
    emitMetric({ metricName: 'NotificationDeliveryErrors', value: failures.length, unit: 'Count' })
    throw new Error(`Failed to process ${failures.length} records`)
  }
}

async function processRecord(record: SQSRecord): Promise<void> {
  const notification: Notification = JSON.parse(record.body)

  logger.info('Processing notification', {
    id: notification.id,
    type: notification.type,
    targetSlackUserId: notification.targetSlackUserId,
    targetWorkspaceId: notification.targetWorkspaceId,
  })

  const user = await userDao.findById(notification.targetSlackUserId)
  if (!user) {
    logger.info('User not found, skipping', { userId: notification.targetSlackUserId })
    emitMetric({
      metricName: 'NotificationsSkippedAtDelivery',
      value: 1,
      unit: 'Count',
      dimensions: { Reason: 'UserNotFound' },
    })
    return
  }

  if (!notificationService.shouldNotify(user, notification.type, notification.actorIsBot)) {
    logger.info('Notification disabled by user preferences', {
      userId: user.slackUserId,
      type: notification.type,
    })
    emitMetric({
      metricName: 'NotificationsSkippedAtDelivery',
      value: 1,
      unit: 'Count',
      dimensions: { Reason: 'PreferenceDisabled' },
    })
    return
  }

  // Resolve workspace-specific Slack client using the notification's target workspace
  const slackClient = await slackClientFactory.getClientForWorkspace(notification.targetWorkspaceId)

  // Look up an existing parent message for this PR so the second and later
  // notifications post as thread replies instead of new top-level DMs.
  const existingThread = await prThreadDao.findThread(
    user.slackUserId,
    notification.repository,
    notification.prNumber,
  )

  const blocks = notificationService.buildSlackBlocks(notification)
  const result = await slackClient.sendDirectMessage(user.slackUserId, {
    channel: user.slackUserId,
    text: notificationService.buildSummaryText(notification),
    blocks,
    ...(existingThread ? { threadTs: existingThread.threadTs } : {}),
  })

  if (!result.ok) {
    throw new Error(`Failed to send Slack message: ${result.error}`)
  }

  logger.info('Notification sent', {
    notificationId: notification.id,
    slackTs: result.ts,
    threaded: existingThread !== null,
  })
  emitMetric({
    metricName: 'NotificationsSent',
    value: 1,
    unit: 'Count',
    dimensions: { NotificationType: notification.type },
  })
  emitMetric({
    metricName: 'NotificationsThreaded',
    value: 1,
    unit: 'Count',
    dimensions: { Threaded: existingThread !== null ? 'true' : 'false' },
  })

  // Record the parent message so future notifications for this PR thread
  // under it. Skip when this was already a reply, or when Slack omitted
  // ts/channel for some reason (defensive; postMessage normally returns both).
  if (!existingThread && result.ts && result.channel) {
    const createResult = await prThreadDao.createThread({
      slackUserId: user.slackUserId,
      repository: notification.repository,
      prNumber: notification.prNumber,
      channelId: result.channel,
      threadTs: result.ts,
      createdAt: new Date().toISOString(),
    })

    if (!createResult.created) {
      // A concurrent record won the conditional write. We have already sent
      // a top-level DM that won't be threaded under the surviving parent --
      // surface this so we can size the impact before investing in stricter
      // dedup (see plan: race handling deferred to v1+).
      logger.warn('PR thread race detected: duplicate top-level DM sent', {
        slackUserId: user.slackUserId,
        repository: notification.repository,
        prNumber: notification.prNumber,
      })
      emitMetric({
        metricName: 'PrThreadRaceDetected',
        value: 1,
        unit: 'Count',
      })
    }
  } else if (!existingThread) {
    // Top-level send succeeded but Slack didn't return a usable parent ref --
    // we'll start fresh on the next notification. Worth a warning since this
    // means threading silently breaks for this PR.
    logger.warn('Top-level send returned no ts/channel; cannot record thread', {
      slackUserId: user.slackUserId,
      repository: notification.repository,
      prNumber: notification.prNumber,
    })
  }
}
