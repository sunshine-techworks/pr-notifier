import type { User, NotificationPreferences } from '../types/index'

/**
 * Result of a successful account linking
 */
export interface LinkAccountSuccess {
  success: true
  user: User
  canonicalGithubUsername: string
}

/**
 * Result of a failed account linking
 */
export interface LinkAccountError {
  success: false
  reason:
    | 'github_user_not_found'
    | 'github_api_error'
    | 'already_linked_to_other_user'
    | 'database_error'
  message: string
}

export type LinkAccountOutcome = LinkAccountSuccess | LinkAccountError

/**
 * Service interface for user-related business logic
 */
export interface UserService {
  /**
   * Link a GitHub username to a Slack user
   * Validates the GitHub username exists before creating/updating the user
   * Returns a discriminated union with success/failure info
   */
  linkGithubAccount(
    slackUserId: string,
    slackWorkspaceId: string,
    githubUsername: string
  ): Promise<LinkAccountOutcome>

  /**
   * Get user by Slack ID
   */
  getBySlackId(slackUserId: string): Promise<User | null>

  /**
   * Get user by GitHub username
   */
  getByGithubUsername(githubUsername: string): Promise<User | null>

  /**
   * Update user notification preferences
   */
  updatePreferences(
    slackUserId: string,
    preferences: Partial<NotificationPreferences>
  ): Promise<User>

  /**
   * Unlink a user (delete their account)
   */
  unlinkAccount(slackUserId: string): Promise<void>

  /**
   * Check if a user has a specific notification enabled
   */
  hasNotificationEnabled(
    user: User,
    notificationType: keyof NotificationPreferences
  ): boolean
}