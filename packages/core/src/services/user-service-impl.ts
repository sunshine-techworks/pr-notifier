import type { GitHubClient, LinkAccountOutcome, UserDao, UserService } from '../interfaces/index'
import type { NotificationPreferences, User } from '../types/index'
import { DEFAULT_PREFERENCES } from '../types/index'

/**
 * Implementation of UserService
 * Validates GitHub usernames via GitHubClient before storing
 */
export class UserServiceImpl implements UserService {
  constructor(
    private readonly userDao: UserDao,
    private readonly githubClient: GitHubClient,
  ) {}

  async linkGithubAccount(
    slackUserId: string,
    slackWorkspaceId: string,
    githubUsername: string,
  ): Promise<LinkAccountOutcome> {
    // Step 1: Validate the GitHub username exists
    const validationResult = await this.githubClient.validateUser(githubUsername)

    if (!validationResult.valid) {
      // Map GitHub API errors to LinkAccountOutcome errors
      if (validationResult.reason === 'not_found') {
        return {
          success: false,
          reason: 'github_user_not_found',
          message:
            `Could not find GitHub user \`${githubUsername}\`. Please check the spelling and try again.`,
        }
      }

      // For rate_limited and api_error, return github_api_error
      return {
        success: false,
        reason: 'github_api_error',
        message:
          'Unable to verify your GitHub username right now. Please try again in a few minutes.',
      }
    }

    // Use the canonical username from GitHub (correct casing)
    const canonicalUsername = validationResult.user.login

    // Step 2: Check if this GitHub username is already linked to another Slack user
    const existingGithubUser = await this.userDao.findByGithubUsername(canonicalUsername)
    if (existingGithubUser && existingGithubUser.slackUserId !== slackUserId) {
      return {
        success: false,
        reason: 'already_linked_to_other_user',
        message:
          `The GitHub account \`${canonicalUsername}\` is already linked to another Slack user.`,
      }
    }

    // Step 3: Create or update the user
    try {
      const existingUser = await this.userDao.findById(slackUserId)

      let user: User
      if (existingUser) {
        // Update existing user's GitHub username
        user = await this.userDao.update(slackUserId, {
          githubUsername: canonicalUsername,
          updatedAt: new Date().toISOString(),
        })
      } else {
        // Create new user with default preferences
        const now = new Date().toISOString()
        const newUser: User = {
          slackUserId,
          slackWorkspaceId,
          githubUsername: canonicalUsername,
          preferences: { ...DEFAULT_PREFERENCES },
          digestEnabled: false,
          createdAt: now,
          updatedAt: now,
        }
        user = await this.userDao.create(newUser)
      }

      return {
        success: true,
        user,
        canonicalGithubUsername: canonicalUsername,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Database error while linking account:', errorMessage)

      return {
        success: false,
        reason: 'database_error',
        message: 'Failed to save your account link. Please try again.',
      }
    }
  }

  async getBySlackId(slackUserId: string): Promise<User | null> {
    return this.userDao.findById(slackUserId)
  }

  async getByGithubUsername(githubUsername: string): Promise<User | null> {
    return this.userDao.findByGithubUsername(githubUsername)
  }

  async updatePreferences(
    slackUserId: string,
    preferences: Partial<NotificationPreferences>,
  ): Promise<User> {
    const user = await this.userDao.findById(slackUserId)
    if (!user) {
      throw new Error(`User not found: ${slackUserId}`)
    }

    return this.userDao.update(slackUserId, {
      preferences: { ...user.preferences, ...preferences },
      updatedAt: new Date().toISOString(),
    })
  }

  async unlinkAccount(slackUserId: string): Promise<void> {
    await this.userDao.delete(slackUserId)
  }

  hasNotificationEnabled(
    user: User,
    notificationType: keyof NotificationPreferences,
  ): boolean {
    return user.preferences[notificationType]
  }
}
