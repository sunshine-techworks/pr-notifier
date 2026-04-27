import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import {
  ConsoleLogger,
  GitHubClientImpl,
  GitHubOAuthServiceImpl,
  SlackClientFactoryImpl,
  UserDaoImpl,
  UserServiceImpl,
  verifySignedState,
  WorkspaceDaoImpl,
  WorkspaceServiceImpl,
} from '@pr-notify/core'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import { emitMetric } from '../shared/metrics'

const GITHUB_CLIENT_ID = process.env['GITHUB_CLIENT_ID'] ?? ''
const GITHUB_CLIENT_SECRET = process.env['GITHUB_CLIENT_SECRET'] ?? ''
const GITHUB_WEBHOOK_SECRET = process.env['GITHUB_WEBHOOK_SECRET'] ?? ''
const USERS_TABLE_NAME = process.env['USERS_TABLE_NAME'] ?? ''
const WORKSPACES_TABLE_NAME = process.env['WORKSPACES_TABLE_NAME'] ?? ''
const SLACK_SIGNING_SECRET = process.env['SLACK_SIGNING_SECRET'] ?? ''
const SLACK_BOT_TOKEN = process.env['SLACK_BOT_TOKEN'] ?? ''
const GITHUB_TOKEN = process.env['GITHUB_TOKEN']

const dynamoClient = new DynamoDBClient({})
const docClient = DynamoDBDocumentClient.from(dynamoClient)
const userDao = new UserDaoImpl(docClient, USERS_TABLE_NAME)
const githubClient = new GitHubClientImpl(GITHUB_TOKEN)
const userService = new UserServiceImpl(userDao, githubClient)
const workspaceDao = new WorkspaceDaoImpl(docClient, WORKSPACES_TABLE_NAME)
const workspaceService = new WorkspaceServiceImpl(workspaceDao)
const slackClientFactory = new SlackClientFactoryImpl(
  workspaceService,
  SLACK_SIGNING_SECRET,
  SLACK_BOT_TOKEN || undefined,
)
const githubOAuthService = new GitHubOAuthServiceImpl(GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET)
const logger = new ConsoleLogger()

/**
 * Lambda handler for GitHub OAuth callback.
 * Verifies the HMAC-signed state, exchanges the authorization code
 * for a token, fetches the authenticated user's identity, links
 * the account, and sends a confirmation DM.
 */
export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const code = event.queryStringParameters?.['code']
    const state = event.queryStringParameters?.['state']
    const error = event.queryStringParameters?.['error']

    // Handle user denying authorization on GitHub
    if (error) {
      logger.info('User denied GitHub authorization', { error })
      return htmlResponse(
        400,
        'Authorization cancelled',
        'You cancelled the GitHub authorization. Run <code>/pr-notify link</code> to try again.',
      )
    }

    if (!code || !state) {
      logger.error('GitHub OAuth callback missing code or state')
      return htmlResponse(
        400,
        'Missing parameters',
        'The callback is missing required parameters. Run <code>/pr-notify link</code> to try again.',
      )
    }

    // Verify the HMAC-signed state to recover Slack user context
    const payload = verifySignedState(state, GITHUB_WEBHOOK_SECRET)
    if (!payload) {
      logger.error('Invalid or expired OAuth state')
      return htmlResponse(
        400,
        'Link expired',
        'The link has expired or is invalid. Run <code>/pr-notify link</code> to get a new one.',
      )
    }

    // Exchange the authorization code for an access token
    const tokenResult = await githubOAuthService.exchangeCodeForToken(code)
    if (!tokenResult.ok || !tokenResult.accessToken) {
      logger.error('GitHub token exchange failed', { error: tokenResult.error })
      emitMetric({
        metricName: 'OAuthErrors',
        value: 1,
        unit: 'Count',
        dimensions: { Provider: 'GitHub' },
      })
      return htmlResponse(
        500,
        'Token exchange failed',
        'Failed to verify your GitHub account. Run <code>/pr-notify link</code> to try again.',
      )
    }

    // Fetch the authenticated user's identity (this is the verification step)
    const githubUser = await githubOAuthService.getAuthenticatedUser(tokenResult.accessToken)
    if (!githubUser) {
      logger.error('Failed to fetch authenticated GitHub user')
      return htmlResponse(
        500,
        'Identity verification failed',
        'Could not verify your GitHub identity. Run <code>/pr-notify link</code> to try again.',
      )
    }

    // Link the verified GitHub account to the Slack user
    const linkResult = await userService.linkGithubAccount(
      payload.slackUserId,
      payload.slackWorkspaceId,
      githubUser.login,
    )

    if (!linkResult.success) {
      logger.error('Account linking failed', { reason: linkResult.reason })
      return htmlResponse(400, 'Linking failed', linkResult.message)
    }

    logger.info('GitHub account linked via OAuth', {
      slackUserId: payload.slackUserId,
      githubUsername: githubUser.login,
    })
    emitMetric({ metricName: 'AccountsLinked', value: 1, unit: 'Count' })

    // Send confirmation DM to the user (non-fatal if it fails)
    try {
      const slackClient = await slackClientFactory.getClientForWorkspace(payload.slackWorkspaceId)
      await slackClient.sendDirectMessage(payload.slackUserId, {
        channel: payload.slackUserId,
        text:
          `Successfully linked to GitHub account \`${githubUser.login}\`. You'll now receive PR notifications via DM.`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text:
                `Successfully linked to GitHub account \`${githubUser.login}\`! You'll now receive PR notifications via DM.`,
            },
          },
        ],
      })
    } catch (dmError) {
      logger.warn('Failed to send confirmation DM', { error: dmError })
    }

    // Return success page with auto-redirect to Slack
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta http-equiv="refresh" content="3;url=slack://open">
<style>body{font-family:-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f8f8f8}
.card{background:white;border-radius:12px;padding:40px;text-align:center;max-width:400px;box-shadow:0 2px 8px rgba(0,0,0,0.1)}
h2{color:#2EB67D;margin-bottom:8px}</style></head>
<body><div class="card">
<h2>Account Connected</h2>
<p>Linked to GitHub account <strong>${githubUser.login}</strong></p>
<p style="color:#666;font-size:14px">Redirecting to Slack...</p>
</div></body></html>`,
    }
  } catch (error) {
    logger.error('Error processing GitHub OAuth callback', { error })
    return htmlResponse(
      500,
      'Something went wrong',
      'An unexpected error occurred. Run <code>/pr-notify link</code> to try again.',
    )
  }
}

/** Returns a simple HTML error/info page */
function htmlResponse(statusCode: number, title: string, message: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html' },
    body: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>body{font-family:-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f8f8f8}
.card{background:white;border-radius:12px;padding:40px;text-align:center;max-width:400px;box-shadow:0 2px 8px rgba(0,0,0,0.1)}
h2{color:#E01E5A;margin-bottom:8px}</style></head>
<body><div class="card">
<h2>${title}</h2>
<p>${message}</p>
</div></body></html>`,
  }
}
