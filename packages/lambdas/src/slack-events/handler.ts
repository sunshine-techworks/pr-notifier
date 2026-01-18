import { SlackClientImpl } from '@pr-notify/core'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

const SLACK_BOT_TOKEN = process.env['SLACK_BOT_TOKEN'] ?? ''
const SLACK_SIGNING_SECRET = process.env['SLACK_SIGNING_SECRET'] ?? ''

const slackClient = new SlackClientImpl(SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET)

/**
 * Lambda handler for Slack Events API
 * Handles app_home_opened, block_actions, etc.
 */
export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const body = event.body ?? ''

    // Handle URL verification challenge (initial setup)
    const payload = JSON.parse(body)
    if (payload.type === 'url_verification') {
      return {
        statusCode: 200,
        body: payload.challenge,
      }
    }

    // Verify Slack signature for all other requests
    const signature = event.headers['x-slack-signature'] ?? ''
    const timestamp = event.headers['x-slack-request-timestamp'] ?? ''

    if (!slackClient.verifySignature(signature, timestamp, body)) {
      console.error('Invalid Slack signature')
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid signature' }),
      }
    }

    // Route based on event type
    const eventType = payload.event?.type ?? payload.type

    switch (eventType) {
      case 'app_home_opened':
        return handleAppHomeOpened(payload)
      case 'block_actions':
        return handleBlockActions(payload)
      default:
        console.log(`Unhandled event type: ${eventType}`)
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'OK' }),
        }
    }
  } catch (error) {
    console.error('Error processing Slack event:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    }
  }
}

async function handleAppHomeOpened(
  payload: Record<string, unknown>,
): Promise<APIGatewayProxyResult> {
  // Access via bracket notation to satisfy noPropertyAccessFromIndexSignature
  const eventData = payload['event']
  const isRecord = (val: unknown): val is Record<string, unknown> =>
    typeof val === 'object' && val !== null
  const userId = isRecord(eventData) ? eventData['user'] : undefined

  console.log('App home opened by user:', userId)

  // TODO: Build and publish app home view
  // This would show the user's settings and linked account status

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'OK' }),
  }
}

async function handleBlockActions(
  payload: Record<string, unknown>,
): Promise<APIGatewayProxyResult> {
  // Access via bracket notation to satisfy noPropertyAccessFromIndexSignature
  const actions = payload['actions']

  console.log('Block actions received:', actions)

  // TODO: Handle interactive component actions
  // e.g., preference toggles, unlink button, etc.

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'OK' }),
  }
}
