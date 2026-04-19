import { createHmac, timingSafeEqual } from 'node:crypto'

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import {
  NotificationQueueImpl,
  NotificationServiceImpl,
  ConsoleLogger,
  UserDaoImpl,
  WebhookProcessorImpl,
} from '@pr-notify/core'
import type { ProcessingResult } from '@pr-notify/core'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

const GITHUB_WEBHOOK_SECRET = process.env['GITHUB_WEBHOOK_SECRET'] ?? ''
const NOTIFICATION_QUEUE_URL = process.env['NOTIFICATION_QUEUE_URL'] ?? ''
const USERS_TABLE_NAME = process.env['USERS_TABLE_NAME'] ?? ''

// Initialize dependencies outside the handler for Lambda cold-start caching
const dynamoClient = new DynamoDBClient({})
const docClient = DynamoDBDocumentClient.from(dynamoClient)
const userDao = new UserDaoImpl(docClient, USERS_TABLE_NAME)
const notificationService = new NotificationServiceImpl()
const notificationQueue = new NotificationQueueImpl(NOTIFICATION_QUEUE_URL)
const logger = new ConsoleLogger()
const webhookProcessor = new WebhookProcessorImpl(
  userDao,
  notificationService,
  notificationQueue,
  logger,
)

/**
 * Lambda handler for GitHub webhook ingestion.
 * Validates the webhook signature, parses the event, and dispatches
 * to the WebhookProcessor which handles user lookup and SQS queuing.
 */
export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    // Validate webhook signature.
    // API Gateway REST API preserves header casing, so we need case-insensitive lookup.
    const headers = Object.fromEntries(
      Object.entries(event.headers).map(([k, v]) => [k.toLowerCase(), v]),
    )
    const signature = headers['x-hub-signature-256'] ?? ''
    const body = event.body ?? ''

    if (!verifyGitHubSignature(signature, body, GITHUB_WEBHOOK_SECRET)) {
      logger.error('Invalid GitHub webhook signature')
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid signature' }),
      }
    }

    // Parse event type from headers
    const eventType = headers['x-github-event']
    if (!eventType) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing X-GitHub-Event header' }),
      }
    }

    // Parse payload
    const payload = JSON.parse(body)

    // Route to appropriate processor method based on event type
    let result: ProcessingResult

    switch (eventType) {
      case 'pull_request':
        result = await webhookProcessor.processPullRequestEvent(payload)
        break
      case 'pull_request_review':
        result = await webhookProcessor.processPullRequestReviewEvent(payload)
        break
      case 'pull_request_review_comment':
        result = await webhookProcessor.processPullRequestReviewCommentEvent(payload)
        break
      case 'issue_comment':
        result = await webhookProcessor.processIssueCommentEvent(payload)
        break
      default:
        logger.info('Ignoring unsupported event type', { eventType })
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'Event type not supported' }),
        }
    }

    logger.info('Webhook processed', {
      eventType,
      action: payload.action,
      repository: payload.repository?.full_name,
      notificationsSent: result.notificationsSent,
      skipped: result.skipped.length,
    })

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Webhook processed',
        notificationsSent: result.notificationsSent,
        skipped: result.skipped.length,
      }),
    }
  } catch (error) {
    logger.error('Error processing webhook', { error })
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    }
  }
}

/**
 * Verify GitHub webhook signature using HMAC-SHA256 with timing-safe comparison
 */
function verifyGitHubSignature(
  signature: string,
  body: string,
  secret: string,
): boolean {
  if (!signature || !secret) {
    return false
  }

  const expectedSignature = 'sha256='
    + createHmac('sha256', secret).update(body).digest('hex')

  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    )
  } catch {
    return false
  }
}
