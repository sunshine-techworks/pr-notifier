import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import {
  buildAppHomeBlocks,
  GitHubClientImpl,
  ConsoleLogger,
  SlackClientImpl,
  UserDaoImpl,
  UserServiceImpl,
} from '@pr-notify/core'
import type { NotificationPreferences } from '@pr-notify/core'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

const SLACK_BOT_TOKEN = process.env['SLACK_BOT_TOKEN'] ?? ''
const SLACK_SIGNING_SECRET = process.env['SLACK_SIGNING_SECRET'] ?? ''
const USERS_TABLE_NAME = process.env['USERS_TABLE_NAME'] ?? ''
const GITHUB_TOKEN = process.env['GITHUB_TOKEN']

// Initialize dependencies at module scope for Lambda cold-start caching
const dynamoClient = new DynamoDBClient({})
const docClient = DynamoDBDocumentClient.from(dynamoClient)
const userDao = new UserDaoImpl(docClient, USERS_TABLE_NAME)
const githubClient = new GitHubClientImpl(GITHUB_TOKEN)
const userService = new UserServiceImpl(userDao, githubClient)
const slackClient = new SlackClientImpl(SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET)
const logger = new ConsoleLogger()

/** Type guard for safely accessing untyped payload fields */
const isRecord = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null

/**
 * Parses Slack payloads that arrive in two different formats:
 * - Events API (/slack/events): raw JSON body
 * - Interactions (/slack/interactions): form-urlencoded with a `payload` JSON field
 */
function parseSlackPayload(body: string): Record<string, unknown> {
  if (body.startsWith('payload=')) {
    const params = new URLSearchParams(body)
    const payloadStr = params.get('payload') ?? '{}'
    return JSON.parse(payloadStr)
  }
  return JSON.parse(body)
}

/**
 * Lambda handler for Slack Events API and interactive components.
 * Receives both /slack/events and /slack/interactions traffic.
 */
export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const body = event.body ?? ''
    const payload = parseSlackPayload(body)

    // Handle URL verification challenge (required for initial Slack app setup)
    if (payload['type'] === 'url_verification') {
      return {
        statusCode: 200,
        body: String(payload['challenge'] ?? ''),
      }
    }

    // Verify Slack signature for all other requests.
    // API Gateway REST API preserves header casing, so we need case-insensitive lookup.
    const headers = Object.fromEntries(
      Object.entries(event.headers).map(([k, v]) => [k.toLowerCase(), v]),
    )
    const signature = headers['x-slack-signature'] ?? ''
    const timestamp = headers['x-slack-request-timestamp'] ?? ''

    if (!slackClient.verifySignature(signature, timestamp, body)) {
      logger.error('Invalid Slack signature')
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid signature' }),
      }
    }

    // Route based on event type — Events API nests under payload.event.type,
    // while interactive payloads use payload.type directly
    const eventObj = payload['event']
    const eventType = isRecord(eventObj) ? String(eventObj['type']) : String(payload['type'])

    switch (eventType) {
      case 'app_home_opened':
        return handleAppHomeOpened(payload)
      case 'block_actions':
        return handleBlockActions(payload)
      default:
        logger.info('Unhandled event type', { eventType })
        return {
          statusCode: 200,
          body: JSON.stringify({ message: 'OK' }),
        }
    }
  } catch (error) {
    logger.error('Error processing Slack event', { error })
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    }
  }
}

/**
 * Handles the app_home_opened event by publishing the App Home view.
 * Looks up the user to determine linked/unlinked state and builds
 * the view accordingly.
 */
async function handleAppHomeOpened(
  payload: Record<string, unknown>,
): Promise<APIGatewayProxyResult> {
  const eventData = payload['event']
  const userId = isRecord(eventData) ? String(eventData['user']) : undefined

  if (!userId) {
    return { statusCode: 200, body: JSON.stringify({ message: 'OK' }) }
  }

  const user = await userService.getBySlackId(userId)
  const blocks = buildAppHomeBlocks(user)
  await slackClient.publishAppHome(userId, { type: 'home', blocks })

  logger.info('App Home published', { userId, linked: !!user })

  return { statusCode: 200, body: JSON.stringify({ message: 'OK' }) }
}

/**
 * Handles interactive component actions from the App Home.
 * Routes by action_id to the appropriate handler, then refreshes the view.
 */
async function handleBlockActions(
  payload: Record<string, unknown>,
): Promise<APIGatewayProxyResult> {
  const userObj = payload['user']
  const userId = isRecord(userObj) ? String(userObj['id']) : undefined

  if (!userId) {
    return { statusCode: 200, body: JSON.stringify({ message: 'OK' }) }
  }

  const actions = payload['actions']
  if (!Array.isArray(actions)) {
    return { statusCode: 200, body: JSON.stringify({ message: 'OK' }) }
  }

  for (const action of actions) {
    if (!isRecord(action)) continue
    const actionId = String(action['action_id'])

    if (actionId === 'notification_preferences') {
      await handlePreferencesChange(userId, action)
    } else if (actionId === 'unlink_account') {
      await userService.unlinkAccount(userId)
      logger.info('Account unlinked via App Home', { userId })
    }
  }

  // Refresh the App Home view after any action to reflect the new state
  const user = await userService.getBySlackId(userId)
  const blocks = buildAppHomeBlocks(user)
  await slackClient.publishAppHome(userId, { type: 'home', blocks })

  return { statusCode: 200, body: JSON.stringify({ message: 'OK' }) }
}

/**
 * Derives the full preferences state from the checkbox selection.
 * Slack sends all currently selected options — a preference is ON if
 * its key appears in selected_options, OFF otherwise.
 */
async function handlePreferencesChange(
  userId: string,
  action: Record<string, unknown>,
): Promise<void> {
  const selectedOptions = action['selected_options']
  if (!Array.isArray(selectedOptions)) return

  // Build set of selected preference keys from the checkbox values
  const selectedKeys = new Set(
    selectedOptions
      .filter((opt): opt is Record<string, unknown> => isRecord(opt))
      .map((opt) => String(opt['value'])),
  )

  // Build complete preferences — true if selected, false otherwise
  const preferences: NotificationPreferences = {
    reviewRequests: selectedKeys.has('reviewRequests'),
    reviewsOnMyPrs: selectedKeys.has('reviewsOnMyPrs'),
    commentsFromHumans: selectedKeys.has('commentsFromHumans'),
    commentsFromBots: selectedKeys.has('commentsFromBots'),
    mentions: selectedKeys.has('mentions'),
    ciFailures: selectedKeys.has('ciFailures'),
  }

  await userService.updatePreferences(userId, preferences)
  logger.info('Preferences updated via App Home', { userId, preferences })
}
