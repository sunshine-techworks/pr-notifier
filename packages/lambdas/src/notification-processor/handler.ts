import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import {
  type Notification,
  NotificationServiceImpl,
  SlackClientImpl,
  UserDaoImpl,
} from '@pr-notify/core'
import type { SQSEvent, SQSRecord } from 'aws-lambda'

const USERS_TABLE_NAME = process.env['USERS_TABLE_NAME'] ?? ''
const SLACK_BOT_TOKEN = process.env['SLACK_BOT_TOKEN'] ?? ''
const SLACK_SIGNING_SECRET = process.env['SLACK_SIGNING_SECRET'] ?? ''

// Initialize clients
const dynamoClient = new DynamoDBClient({})
const docClient = DynamoDBDocumentClient.from(dynamoClient)

const userDao = new UserDaoImpl(docClient, USERS_TABLE_NAME)
const notificationService = new NotificationServiceImpl()
const slackClient = new SlackClientImpl(SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET)

/**
 * Lambda handler for processing notifications from SQS
 * Looks up user, checks preferences, and sends Slack DM
 */
export async function handler(event: SQSEvent): Promise<void> {
  const results = await Promise.allSettled(
    event.Records.map(processRecord),
  )

  // Log any failures
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Failed to process record ${index}:`, result.reason)
    }
  })

  // If any records failed, throw to trigger retry
  const failures = results.filter((r) => r.status === 'rejected')
  if (failures.length > 0) {
    throw new Error(`Failed to process ${failures.length} records`)
  }
}

async function processRecord(record: SQSRecord): Promise<void> {
  const notification: Notification = JSON.parse(record.body)

  console.log('Processing notification:', {
    id: notification.id,
    type: notification.type,
    targetSlackUserId: notification.targetSlackUserId,
  })

  // Look up user
  const user = await userDao.findById(notification.targetSlackUserId)
  if (!user) {
    console.log(`User not found: ${notification.targetSlackUserId}, skipping`)
    return
  }

  // Check if user wants this type of notification
  if (!notificationService.shouldNotify(user, notification.type, notification.actorIsBot)) {
    console.log(`User ${user.slackUserId} has disabled ${notification.type} notifications`)
    return
  }

  // Build and send Slack message
  const blocks = notificationService.buildSlackBlocks(notification)
  const result = await slackClient.sendDirectMessage(user.slackUserId, {
    channel: user.slackUserId,
    text: `New ${notification.type} notification for PR #${notification.prNumber}`,
    blocks,
  })

  if (!result.ok) {
    throw new Error(`Failed to send Slack message: ${result.error}`)
  }

  console.log('Notification sent successfully:', {
    notificationId: notification.id,
    slackTs: result.ts,
  })
}
