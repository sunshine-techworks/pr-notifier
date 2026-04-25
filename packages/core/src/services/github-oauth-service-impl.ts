import { z } from 'zod'

import type {
  GitHubAuthenticatedUser,
  GitHubOAuthExchangeResult,
  GitHubOAuthService,
} from '../interfaces/github-oauth-service'

const GITHUB_OAUTH_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const GITHUB_API_USER_URL = 'https://api.github.com/user'

// Zod schemas for GitHub OAuth API responses
const tokenSuccessSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
})

const tokenErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
})

const authenticatedUserSchema = z.object({
  login: z.string(),
  id: z.number(),
  avatar_url: z.string(),
})

/**
 * GitHub OAuth service for verifying account ownership during linking.
 * Exchanges authorization codes for tokens and fetches authenticated
 * user identity. Tokens are used once for identity verification and
 * should be discarded immediately after.
 */
export class GitHubOAuthServiceImpl implements GitHubOAuthService {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  async exchangeCodeForToken(code: string): Promise<GitHubOAuthExchangeResult> {
    try {
      const response = await fetch(GITHUB_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
        }),
      })

      const data: unknown = await response.json()

      // GitHub returns errors in the response body, not via HTTP status
      const errorResult = tokenErrorSchema.safeParse(data)
      if (errorResult.success) {
        return { ok: false, error: errorResult.data.error }
      }

      const successResult = tokenSuccessSchema.safeParse(data)
      if (!successResult.success) {
        return { ok: false, error: 'invalid_response' }
      }

      return { ok: true, accessToken: successResult.data.access_token }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return { ok: false, error: message }
    }
  }

  async getAuthenticatedUser(accessToken: string): Promise<GitHubAuthenticatedUser | null> {
    try {
      const response = await fetch(GITHUB_API_USER_URL, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'PRNotify',
        },
      })

      if (!response.ok) {
        return null
      }

      const data: unknown = await response.json()
      const result = authenticatedUserSchema.safeParse(data)

      if (!result.success) {
        return null
      }

      return {
        login: result.data.login,
        id: result.data.id,
        avatarUrl: result.data.avatar_url,
      }
    } catch {
      return null
    }
  }
}
