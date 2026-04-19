import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { GitHubClientImpl, SlackClientImpl, UserDaoImpl, UserServiceImpl } from '@pr-notify/core'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

const USERS_TABLE_NAME = process.env['USERS_TABLE_NAME'] ?? ''
const SLACK_BOT_TOKEN = process.env['SLACK_BOT_TOKEN'] ?? ''
const SLACK_SIGNING_SECRET = process.env['SLACK_SIGNING_SECRET'] ?? ''
// Optional: GitHub token for higher API rate limits (5000/hr vs 60/hr)
const GITHUB_TOKEN = process.env['GITHUB_TOKEN']

// Initialize clients
const dynamoClient = new DynamoDBClient({})
const docClient = DynamoDBDocumentClient.from(dynamoClient)

const userDao = new UserDaoImpl(docClient, USERS_TABLE_NAME)
const githubClient = new GitHubClientImpl(GITHUB_TOKEN)
const userService = new UserServiceImpl(userDao, githubClient)
const slackClient = new SlackClientImpl(SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET)

/**
 * Lambda handler for Slack slash commands
 * Handles /pr-notify commands: link, prefs, help
 */
export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    // Verify Slack signature.
    // API Gateway REST API preserves header casing, so we need case-insensitive lookup
    // since Slack sends X-Slack-Signature (mixed case).
    const headers = Object.fromEntries(
      Object.entries(event.headers).map(([k, v]) => [k.toLowerCase(), v]),
    )
    const signature = headers['x-slack-signature'] ?? ''
    const timestamp = headers['x-slack-request-timestamp'] ?? ''
    const body = event.body ?? ''

    if (!slackClient.verifySignature(signature, timestamp, body)) {
      console.error('Invalid Slack signature')
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid signature' }),
      }
    }

    // Parse form-urlencoded body
    const params = new URLSearchParams(body)
    const command = params.get('command')
    const text = params.get('text') ?? ''
    const userId = params.get('user_id') ?? ''
    const teamId = params.get('team_id') ?? ''

    console.log('Received slash command:', { command, text, userId })

    // Parse subcommand
    const [subcommand, ...args] = text.trim().split(/\s+/)

    switch (subcommand?.toLowerCase()) {
      case 'link':
        return handleLinkCommand(userId, teamId, args)
      case 'prefs':
        return handlePrefsCommand()
      case 'help':
      default:
        return handleHelpCommand()
    }
  } catch (error) {
    console.error('Error processing slash command:', error)
    return {
      statusCode: 200,
      body: JSON.stringify({
        response_type: 'ephemeral',
        text: 'Something went wrong. Please try again later.',
      }),
    }
  }
}

async function handleLinkCommand(
  userId: string,
  teamId: string,
  args: string[],
): Promise<APIGatewayProxyResult> {
  const githubUsername = args[0]

  if (!githubUsername) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        response_type: 'ephemeral',
        text: 'Usage: `/pr-notify link <github-username>`',
      }),
    }
  }

  const result = await userService.linkGithubAccount(userId, teamId, githubUsername)

  if (result.success) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        response_type: 'ephemeral',
        text:
          `Successfully linked your account to GitHub user \`${result.canonicalGithubUsername}\`! You'll now receive PR notifications via DM.`,
      }),
    }
  }

  // Handle specific error cases with user-friendly messages
  console.error('Link account failed:', result.reason, result.message)

  return {
    statusCode: 200,
    body: JSON.stringify({
      response_type: 'ephemeral',
      text: result.message,
    }),
  }
}

/**
 * Directs users to the App Home tab where preferences are managed.
 * Keeps preferences in a single canonical location to avoid sync issues.
 */
function handlePrefsCommand(): APIGatewayProxyResult {
  return {
    statusCode: 200,
    body: JSON.stringify({
      response_type: 'ephemeral',
      text:
        'Head to the *App Home* tab to manage your notification preferences.\nClick on the PR Notify app name in the sidebar, then select the Home tab.',
    }),
  }
}

function handleHelpCommand(): APIGatewayProxyResult {
  return {
    statusCode: 200,
    body: JSON.stringify({
      response_type: 'ephemeral',
      text: `*PR Notify Commands:*
• \`/pr-notify link <github-username>\` - Link your GitHub account
• \`/pr-notify prefs\` - View your notification preferences
• \`/pr-notify help\` - Show this help message`,
    }),
  }
}
