/**
 * Result of exchanging a GitHub OAuth authorization code for an access token.
 */
export interface GitHubOAuthExchangeResult {
  ok: boolean
  accessToken?: string
  error?: string
}

/**
 * Authenticated GitHub user identity returned from the /user endpoint.
 */
export interface GitHubAuthenticatedUser {
  login: string
  id: number
  avatarUrl: string
}

/**
 * Service for GitHub OAuth operations used in account linking.
 * Exchanges authorization codes for tokens and fetches the
 * authenticated user's identity to verify account ownership.
 */
export interface GitHubOAuthService {
  /**
   * Exchange an authorization code for an access token.
   */
  exchangeCodeForToken(code: string): Promise<GitHubOAuthExchangeResult>

  /**
   * Fetch the authenticated user's identity using an access token.
   * The token is used for this single call and should be discarded after.
   */
  getAuthenticatedUser(accessToken: string): Promise<GitHubAuthenticatedUser | null>
}
