/**
 * Result of exchanging an OAuth authorization code for an access token.
 */
export interface OAuthExchangeResult {
  ok: boolean
  accessToken?: string
  teamId?: string
  teamName?: string
  error?: string
}

/**
 * Service for handling Slack OAuth 2.0 V2 authorization flow.
 * Generates authorization URLs and exchanges codes for tokens.
 */
export interface OAuthService {
  /**
   * Build the Slack OAuth authorization URL that users visit to install the app.
   */
  getAuthorizationUrl(): string

  /**
   * Exchange an authorization code (from Slack's callback) for a bot access token.
   * Does not persist the token - that is the caller's responsibility.
   */
  exchangeCodeForToken(code: string): Promise<OAuthExchangeResult>
}
