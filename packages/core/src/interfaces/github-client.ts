/**
 * Result of a successful GitHub user validation
 */
export interface GitHubUserValidationSuccess {
  valid: true
  user: {
    login: string // Canonical username from GitHub (may differ in case from input)
    id: number
    avatarUrl: string
    name: string | null
    type: 'User' | 'Organization' | 'Bot'
  }
}

/**
 * Result of a failed GitHub user validation
 */
export interface GitHubUserValidationFailure {
  valid: false
  reason: 'not_found' | 'rate_limited' | 'api_error'
  message: string
}

export type GitHubUserValidationResult =
  | GitHubUserValidationSuccess
  | GitHubUserValidationFailure

/**
 * Client interface for GitHub API operations
 */
export interface GitHubClient {
  /**
   * Validate that a GitHub username exists and return user details
   * Uses the GitHub REST API /users/:username endpoint
   */
  validateUser(username: string): Promise<GitHubUserValidationResult>
}
