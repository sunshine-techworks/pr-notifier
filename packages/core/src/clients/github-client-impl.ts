import { z } from 'zod'

import type { GitHubClient, GitHubUserValidationResult } from '../interfaces/github-client'

/**
 * Zod schema for GitHub API user response
 * Only includes the fields we need for validation
 */
const githubUserResponseSchema = z.object({
  login: z.string(),
  id: z.number(),
  avatar_url: z.string(),
  name: z.string().nullable(),
  type: z.enum(['User', 'Organization', 'Bot']),
})

/**
 * Implementation of GitHubClient using native fetch
 * Uses GitHub REST API to validate usernames
 */
export class GitHubClientImpl implements GitHubClient {
  private readonly baseUrl = 'https://api.github.com'

  constructor(
    // Optional token for higher rate limits (5000/hr vs 60/hr unauthenticated)
    private readonly token?: string,
  ) {}

  async validateUser(username: string): Promise<GitHubUserValidationResult> {
    const url = `${this.baseUrl}/users/${encodeURIComponent(username)}`

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'pr-notify-slack-app',
    }

    // Add authorization header if token is provided
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    try {
      const response = await fetch(url, { headers })

      if (response.status === 404) {
        return {
          valid: false,
          reason: 'not_found',
          message: `GitHub user '${username}' not found`,
        }
      }

      if (response.status === 403) {
        // Check if rate limited
        const rateLimitRemaining = response.headers.get('x-ratelimit-remaining')
        if (rateLimitRemaining === '0') {
          const resetTime = response.headers.get('x-ratelimit-reset')
          const resetDate = resetTime
            ? new Date(parseInt(resetTime, 10) * 1000).toISOString()
            : 'unknown'

          return {
            valid: false,
            reason: 'rate_limited',
            message: `GitHub API rate limit exceeded. Resets at ${resetDate}`,
          }
        }
      }

      if (!response.ok) {
        return {
          valid: false,
          reason: 'api_error',
          message: `GitHub API error: ${response.status} ${response.statusText}`,
        }
      }

      const json = await response.json()
      const parseResult = githubUserResponseSchema.safeParse(json)

      if (!parseResult.success) {
        console.error('Failed to parse GitHub user response:', parseResult.error)
        return {
          valid: false,
          reason: 'api_error',
          message: 'Unexpected response format from GitHub API',
        }
      }

      const data = parseResult.data

      return {
        valid: true,
        user: {
          login: data.login,
          id: data.id,
          avatarUrl: data.avatar_url,
          name: data.name,
          type: data.type,
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('GitHub API request failed:', errorMessage)

      return {
        valid: false,
        reason: 'api_error',
        message: `Failed to connect to GitHub API: ${errorMessage}`,
      }
    }
  }
}
