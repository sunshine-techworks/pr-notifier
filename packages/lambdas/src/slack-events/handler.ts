import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import {
  buildAppHomeBlocks,
  ConsoleLogger,
  GitHubClientImpl,
  SlackClientFactoryImpl,
  UserDaoImpl,
  UserServiceImpl,
  verifySlackSignature,
  WorkspaceDaoImpl,
  WorkspaceServiceImpl,
} from '@pr-notify/core'
import type { NotificationPreferences } from '@pr-notify/core'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

const SLACK_SIGNING_SECRET = process.env['SLACK_SIGNING_SECRET'] ?? ''
const USERS_TABLE_NAME = process.env['USERS_TABLE_NAME'] ?? ''
const WORKSPACES_TABLE_NAME = process.env['WORKSPACES_TABLE_NAME'] ?? ''
const GITHUB_TOKEN = process.env['GITHUB_TOKEN']
// Fallback token for backward compatibility during migration
const SLACK_BOT_TOKEN = process.env['SLACK_BOT_TOKEN'] ?? ''

const dynamoClient = new DynamoDBClient({})
const docClient = DynamoDBDocumentClient.from(dynamoClient)
const userDao = new UserDaoImpl(docClient, USERS_TABLE_NAME)
const workspaceDao = new WorkspaceDaoImpl(docClient, WORKSPACES_TABLE_NAME)
const githubClient = new GitHubClientImpl(GITHUB_TOKEN)
const userService = new UserServiceImpl(userDao, githubClient)
const workspaceService = new WorkspaceServiceImpl(workspaceDao)
const slackClientFactory = new SlackClientFactoryImpl(
  workspaceService, SLACK_SIGNING_SECRET, SLACK_BOT_TOKEN || undefined,
)
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
 * Extracts the workspace (team) ID from various Slack payload formats.
 * Events API puts it at payload.team_id, interactions at payload.team.id
 * or payload.user.team_id.
 */
function extractTeamId(payload: Record<string, unknown>): string | undefined {
  // Events API: top-level team_id
  if (typeof payload['team_id'] === 'string') {
    return payload['team_id']
  }
  // Interactions: nested team.id
  const teamObj = payload['team']
  if (isRecord(teamObj) && typeof teamObj['id'] === 'string') {
    return teamObj['id']
  }
  // Fallback: user.team_id
  const userObj = payload['user']
  if (isRecord(userObj) && typeof userObj['team_id'] === 'string') {
    return userObj['team_id']
  }
  return undefined
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

    // Verify Slack signature using standalone verifier (no bot token needed)
    const headers = Object.fromEntries(
      Object.entries(event.headers).map(([k, v]) => [k.toLowerCase(), v]),
    )
    const signature = headers['x-slack-signature'] ?? ''
    const timestamp = headers['x-slack-request-timestamp'] ?? ''

    if (!verifySlackSignature(SLACK_SIGNING_SECRET, signature, timestamp, body)) {
      logger.error('Invalid Slack signature')
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid signature' }),
      }
    }

    // Route based on event type
    const eventObj = payload['event']
    const eventType = isRecord(eventObj) ? String(eventObj['type']) : String(payload['type'])

    switch (eventType) {
      case 'app_home_opened':
        return handleAppHomeOpened(payload)
      case 'block_actions':
        return handleBlockActions(payload)
      case 'app_uninstalled':
        return handleAppUninstalled(payload)
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
 * Publishes the App Home view for the user.
 * Resolves the workspace-specific Slack client from the team_id in the payload.
 */
async function handleAppHomeOpened(
  payload: Record<string, unknown>,
): Promise<APIGatewayProxyResult> {
  const eventData = payload['event']
  const userId = isRecord(eventData) ? String(eventData['user']) : undefined
  const teamId = extractTeamId(payload)

  if (!userId || !teamId) {
    return { statusCode: 200, body: JSON.stringify({ message: 'OK' }) }
  }

  const user = await userService.getBySlackId(userId)
  const blocks = buildAppHomeBlocks(user)

  const slackClient = await slackClientFactory.getClientForWorkspace(teamId)
  await slackClient.publishAppHome(userId, { type: 'home', blocks })

  logger.info('App Home published', { userId, teamId, linked: !!user })

  return { statusCode: 200, body: JSON.stringify({ message: 'OK' }) }
}

/**
 * Handles interactive component actions from the App Home.
 * Resolves workspace-specific client for view refresh.
 */
async function handleBlockActions(
  payload: Record<string, unknown>,
): Promise<APIGatewayProxyResult> {
  const userObj = payload['user']
  const userId = isRecord(userObj) ? String(userObj['id']) : undefined
  const teamId = extractTeamId(payload)

  if (!userId || !teamId) {
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

  // Refresh the App Home view with workspace-specific client
  const user = await userService.getBySlackId(userId)
  const blocks = buildAppHomeBlocks(user)
  const slackClient = await slackClientFactory.getClientForWorkspace(teamId)
  await slackClient.publishAppHome(userId, { type: 'home', blocks })

  return { statusCode: 200, body: JSON.stringify({ message: 'OK' }) }
}

/**
 * Handles app_uninstalled event by removing the workspace record.
 * This deletes the stored bot token so the workspace is cleanly removed.
 */
async function handleAppUninstalled(
  payload: Record<string, unknown>,
): Promise<APIGatewayProxyResult> {
  const teamId = extractTeamId(payload)

  if (!teamId) {
    return { statusCode: 200, body: JSON.stringify({ message: 'OK' }) }
  }

  await workspaceService.removeInstallation(teamId)
  logger.info('Workspace uninstalled', { teamId })

  return { statusCode: 200, body: JSON.stringify({ message: 'OK' }) }
}

/**
 * Derives the full preferences state from the checkbox selection.
 */
async function handlePreferencesChange(
  userId: string,
  action: Record<string, unknown>,
): Promise<void> {
  const selectedOptions = action['selected_options']
  if (!Array.isArray(selectedOptions)) return

  const selectedKeys = new Set(
    selectedOptions
      .filter((opt): opt is Record<string, unknown> => isRecord(opt))
      .map((opt) => String(opt['value'])),
  )

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
