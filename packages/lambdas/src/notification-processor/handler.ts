import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import {
  ConsoleLogger,
  type Notification,
  NotificationServiceImpl,
  SlackClientFactoryImpl,
  UserDaoImpl,
  WorkspaceDaoImpl,
  WorkspaceServiceImpl,
} from '@pr-notify/core'
import type { SQSEvent, SQSRecord } from 'aws-lambda'

import { emitMetric } from '../shared/metrics'

const USERS_TABLE_NAME = process.env['USERS_TABLE_NAME'] ?? ''
const WORKSPACES_TABLE_NAME = process.env['WORKSPACES_TABLE_NAME'] ?? ''
const SLACK_SIGNING_SECRET = process.env['SLACK_SIGNING_SECRET'] ?? ''
// Fallback token for backward compatibility during migration
const SLACK_BOT_TOKEN = process.env['SLACK_BOT_TOKEN'] ?? ''

const dynamoClient = new DynamoDBClient({})
const docClient = DynamoDBDocumentClient.from(dynamoClient)

const userDao = new UserDaoImpl(docClient, USERS_TABLE_NAME)
const workspaceDao = new WorkspaceDaoImpl(docClient, WORKSPACES_TABLE_NAME)
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

  const blocks = notificationService.buildSlackBlocks(notification)
  const result = await slackClient.sendDirectMessage(user.slackUserId, {
    channel: user.slackUserId,
    text: `New ${notification.type} notification for PR #${notification.prNumber}`,
    blocks,
  })

  if (!result.ok) {
    throw new Error(`Failed to send Slack message: ${result.error}`)
  }

  logger.info('Notification sent', {
    notificationId: notification.id,
    slackTs: result.ts,
  })
  emitMetric({
    metricName: 'NotificationsSent',
    value: 1,
    unit: 'Count',
    dimensions: { NotificationType: notification.type },
  })
}
