import type { OAuthExchangeResult, OAuthService } from '../interfaces/oauth-service'

const SLACK_OAUTH_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize'
const SLACK_OAUTH_ACCESS_URL = 'https://slack.com/api/oauth.v2.access'

// Bot scopes required for PR Notify functionality
const BOT_SCOPES = 'chat:write,commands,users:read'

/**
 * Handles the Slack OAuth 2.0 V2 flow for workspace installations.
 * Generates authorization URLs and exchanges codes for bot tokens.
 */
export class OAuthServiceImpl implements OAuthService {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
  ) {}

  getAuthorizationUrl(): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      scope: BOT_SCOPES,
      redirect_uri: this.redirectUri,
    })
    return `${SLACK_OAUTH_AUTHORIZE_URL}?${params.toString()}`
  }

  async exchangeCodeForToken(code: string): Promise<OAuthExchangeResult> {
    try {
      const response = await fetch(SLACK_OAUTH_ACCESS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          redirect_uri: this.redirectUri,
        }).toString(),
      })

      const data = await response.json()

      // Slack API always returns 200 with ok: true/false in the body
      const isRecord = (val: unknown): val is Record<string, unknown> =>
        typeof val === 'object' && val !== null

      if (!isRecord(data) || data['ok'] !== true) {
        const error = isRecord(data) ? String(data['error'] ?? 'unknown_error') : 'invalid_response'
        return { ok: false, error }
      }

      const teamObj = data['team']
      const teamId = isRecord(teamObj) ? String(teamObj['id'] ?? '') : ''
      const teamName = isRecord(teamObj) ? String(teamObj['name'] ?? '') : ''
      const accessToken = String(data['access_token'] ?? '')

      if (!accessToken || !teamId) {
        return { ok: false, error: 'missing_token_or_team' }
      }

      return {
        ok: true,
        accessToken,
        teamId,
        teamName,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { ok: false, error: message }
    }
  }
}
