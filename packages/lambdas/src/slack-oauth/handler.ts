import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import {
  ConsoleLogger,
  OAuthServiceImpl,
  WorkspaceDaoImpl,
  WorkspaceServiceImpl,
} from '@pr-notify/core'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import { emitMetric } from '../shared/metrics'

const SLACK_CLIENT_ID = process.env['SLACK_CLIENT_ID'] ?? ''
const SLACK_CLIENT_SECRET = process.env['SLACK_CLIENT_SECRET'] ?? ''
const SLACK_APP_ID = process.env['SLACK_APP_ID'] ?? ''
const WORKSPACES_TABLE_NAME = process.env['WORKSPACES_TABLE_NAME'] ?? ''

const dynamoClient = new DynamoDBClient({})
const docClient = DynamoDBDocumentClient.from(dynamoClient)
const workspaceDao = new WorkspaceDaoImpl(docClient, WORKSPACES_TABLE_NAME)
const workspaceService = new WorkspaceServiceImpl(workspaceDao)
const logger = new ConsoleLogger()

/**
 * Lambda handler for Slack OAuth 2.0 install flow.
 * Routes GET /slack/oauth/authorize and GET /slack/oauth/callback.
 */
export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const path = event.path

    // Build the redirect URI from the current request context so it
    // matches the URL Slack will callback to
    const host = event.headers['Host'] ?? event.headers['host'] ?? ''
    const stage = event.requestContext.stage
    const redirectUri = `https://${host}/${stage}/slack/oauth/callback`

    const oauthService = new OAuthServiceImpl(SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, redirectUri)

    if (path.endsWith('/authorize')) {
      return handleAuthorize(oauthService)
    }

    if (path.endsWith('/callback')) {
      return handleCallback(event, oauthService)
    }

    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Not found' }),
    }
  } catch (error) {
    logger.error('Error processing OAuth request', { error })
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    }
  }
}

/**
 * Redirects the user to Slack's OAuth authorization page.
 */
function handleAuthorize(
  oauthService: OAuthServiceImpl,
): APIGatewayProxyResult {
  const authUrl = oauthService.getAuthorizationUrl()

  return {
    statusCode: 302,
    headers: { Location: authUrl },
    body: '',
  }
}

/**
 * Handles the OAuth callback from Slack.
 * Exchanges the authorization code for a bot token, registers the workspace,
 * and redirects to the app in Slack.
 */
async function handleCallback(
  event: APIGatewayProxyEvent,
  oauthService: OAuthServiceImpl,
): Promise<APIGatewayProxyResult> {
  const code = event.queryStringParameters?.['code']

  if (!code) {
    logger.error('OAuth callback missing code parameter')
    return {
      statusCode: 400,
      body:
        '<html><body><h2>Installation failed</h2><p>Missing authorization code. Please try again.</p></body></html>',
      headers: { 'Content-Type': 'text/html' },
    }
  }

  const result = await oauthService.exchangeCodeForToken(code)

  if (!result.ok || !result.accessToken || !result.teamId) {
    logger.error('OAuth token exchange failed', { error: result.error })
    emitMetric({ metricName: 'OAuthErrors', value: 1, unit: 'Count' })
    return {
      statusCode: 400,
      body: `<html><body><h2>Installation failed</h2><p>Error: ${
        result.error ?? 'unknown'
      }. Please try again.</p></body></html>`,
      headers: { 'Content-Type': 'text/html' },
    }
  }

  // Register the workspace installation (create or update on re-install)
  await workspaceService.registerInstallation({
    teamId: result.teamId,
    teamName: result.teamName ?? '',
    botToken: result.accessToken,
  })

  logger.info('Workspace installed via OAuth', {
    teamId: result.teamId,
    teamName: result.teamName,
  })
  emitMetric({ metricName: 'WorkspacesInstalled', value: 1, unit: 'Count' })

  // Redirect to the app in Slack
  return {
    statusCode: 302,
    headers: { Location: `https://slack.com/app_redirect?app=${SLACK_APP_ID}` },
    body: '',
  }
}
