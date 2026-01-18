import { createHmac, timingSafeEqual } from 'node:crypto'

import { NotificationQueueImpl } from '@pr-notify/core'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

const GITHUB_WEBHOOK_SECRET = process.env['GITHUB_WEBHOOK_SECRET'] ?? ''
const NOTIFICATION_QUEUE_URL = process.env['NOTIFICATION_QUEUE_URL'] ?? ''

// TODO: Use queue when implementing webhook processing
const _notificationQueue = new NotificationQueueImpl(NOTIFICATION_QUEUE_URL)

/**
 * Lambda handler for GitHub webhook ingestion
 * Validates the webhook signature, parses the event, and queues it for processing
 */
export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    // Validate webhook signature
    const signature = event.headers['x-hub-signature-256'] ?? ''
    const body = event.body ?? ''

    if (!verifyGitHubSignature(signature, body, GITHUB_WEBHOOK_SECRET)) {
      console.error('Invalid GitHub webhook signature')
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid signature' }),
      }
    }

    // Parse event type from headers
    const eventType = event.headers['x-github-event']
    if (!eventType) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing X-GitHub-Event header' }),
      }
    }

    // Parse payload
    const payload = JSON.parse(body)

    // Only process events we care about
    const supportedEvents = [
      'pull_request',
      'pull_request_review',
      'pull_request_review_comment',
      'issue_comment',
    ]

    if (!supportedEvents.includes(eventType)) {
      console.log(`Ignoring unsupported event type: ${eventType}`)
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Event type not supported' }),
      }
    }

    // Queue the event for processing
    // TODO: Transform payload into Notification and send to queue
    console.log(`Received ${eventType} event`, {
      action: payload.action,
      repository: payload.repository?.full_name,
    })

    // Return 200 immediately to acknowledge receipt
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Webhook received' }),
    }
  } catch (error) {
    console.error('Error processing webhook:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    }
  }
}

/**
 * Verify GitHub webhook signature
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
