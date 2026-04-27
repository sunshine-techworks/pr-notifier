import { ConsoleLogger, createSignedState, verifySlackSignature } from '@pr-notify/core'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import { emitMetric } from '../shared/metrics'

const SLACK_SIGNING_SECRET = process.env['SLACK_SIGNING_SECRET'] ?? ''
const GITHUB_CLIENT_ID = process.env['GITHUB_CLIENT_ID'] ?? ''
// Used as HMAC key for signing the OAuth state parameter
const GITHUB_WEBHOOK_SECRET = process.env['GITHUB_WEBHOOK_SECRET'] ?? ''

const logger = new ConsoleLogger()

/** 5-minute expiry for OAuth state tokens */
const STATE_EXPIRY_MS = 5 * 60 * 1000

/**
 * Lambda handler for Slack slash commands.
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

    if (!verifySlackSignature(SLACK_SIGNING_SECRET, signature, timestamp, body)) {
      logger.error('Invalid Slack signature')
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

    logger.info('Received slash command', { command, text, userId })

    // Parse subcommand
    const [subcommand] = text.trim().split(/\s+/)
    emitMetric({
      metricName: 'CommandsUsed',
      value: 1,
      unit: 'Count',
      dimensions: { Command: subcommand?.toLowerCase() ?? 'help' },
    })

    switch (subcommand?.toLowerCase()) {
      case 'link':
        return handleLinkCommand(userId, teamId)
      case 'prefs':
        return handlePrefsCommand()
      case 'help':
      default:
        return handleHelpCommand()
    }
  } catch (error) {
    logger.error('Error processing slash command', { error })
    return {
      statusCode: 200,
      body: JSON.stringify({
        response_type: 'ephemeral',
        text: 'Something went wrong. Please try again later.',
      }),
    }
  }
}

/**
 * Returns an ephemeral message with a "Connect GitHub" button that starts
 * the GitHub OAuth flow. The button URL includes an HMAC-signed state
 * parameter carrying the Slack user context to the OAuth callback.
 */
function handleLinkCommand(
  userId: string,
  teamId: string,
): APIGatewayProxyResult {
  const state = createSignedState(
    { slackUserId: userId, slackWorkspaceId: teamId, exp: Date.now() + STATE_EXPIRY_MS },
    GITHUB_WEBHOOK_SECRET,
  )

  const githubAuthUrl =
    `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&state=${state}`

  return {
    statusCode: 200,
    body: JSON.stringify({
      response_type: 'ephemeral',
      text: 'Connect your GitHub account to receive PR notifications.',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              'Connect your GitHub account to verify your identity and start receiving PR notifications.',
          },
          accessory: {
            type: 'button',
            text: { type: 'plain_text', text: 'Connect GitHub', emoji: true },
            url: githubAuthUrl,
            action_id: 'github_oauth_connect',
            style: 'primary',
          },
        },
      ],
    }),
  }
}

/**
 * Directs users to the App Home tab where preferences are managed.
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
\u2022 \`/pr-notify link\` - Connect your GitHub account
\u2022 \`/pr-notify prefs\` - Manage notification preferences
\u2022 \`/pr-notify help\` - Show this help message`,
    }),
  }
}
