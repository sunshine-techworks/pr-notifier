import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GitHubClient } from '../interfaces/github-client'
import type { UserDao } from '../interfaces/user-dao'
import {
  createGitHubValidationSuccess,
  createMockGitHubClient,
  createMockUserDao,
  createTestUser,
} from '../testing/index'

import { UserServiceImpl } from './user-service-impl'

describe('UserServiceImpl', () => {
  let mockUserDao: UserDao
  let mockGitHubClient: GitHubClient
  let userService: UserServiceImpl

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks()

    mockUserDao = createMockUserDao()
    mockGitHubClient = createMockGitHubClient()
    userService = new UserServiceImpl(mockUserDao, mockGitHubClient)
  })

  describe('linkGithubAccount', () => {
    it('creates new user when valid GitHub username provided', async () => {
      // Arrange: GitHub user exists
      vi.mocked(mockGitHubClient.validateUser).mockResolvedValue(
        createGitHubValidationSuccess({ login: 'octocat' }),
      )
      // Arrange: No existing user with this GitHub username
      vi.mocked(mockUserDao.findByGithubUsername).mockResolvedValue(null)
      // Arrange: No existing Slack user
      vi.mocked(mockUserDao.findById).mockResolvedValue(null)
      // Arrange: Create returns the new user
      const expectedUser = createTestUser({
        slackUserId: 'U_NEW_USER',
        slackWorkspaceId: 'W_WORKSPACE',
        githubUsername: 'octocat',
      })
      vi.mocked(mockUserDao.create).mockResolvedValue(expectedUser)

      // Act
      const result = await userService.linkGithubAccount(
        'U_NEW_USER',
        'W_WORKSPACE',
        'octocat',
      )

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.user.slackUserId).toBe('U_NEW_USER')
        expect(result.user.githubUsername).toBe('octocat')
        expect(result.canonicalGithubUsername).toBe('octocat')
      }
      expect(mockUserDao.create).toHaveBeenCalledTimes(1)
      expect(mockUserDao.update).not.toHaveBeenCalled()
    })

    it('updates existing user GitHub username when re-linking', async () => {
      // Arrange: GitHub user exists
      vi.mocked(mockGitHubClient.validateUser).mockResolvedValue(
        createGitHubValidationSuccess({ login: 'newgithubuser' }),
      )
      // Arrange: No one else has this GitHub username
      vi.mocked(mockUserDao.findByGithubUsername).mockResolvedValue(null)
      // Arrange: User already exists with a different GitHub username
      const existingUser = createTestUser({
        slackUserId: 'U_EXISTING',
        githubUsername: 'oldgithubuser',
      })
      vi.mocked(mockUserDao.findById).mockResolvedValue(existingUser)
      // Arrange: Update returns the updated user
      const updatedUser = createTestUser({
        slackUserId: 'U_EXISTING',
        githubUsername: 'newgithubuser',
      })
      vi.mocked(mockUserDao.update).mockResolvedValue(updatedUser)

      // Act
      const result = await userService.linkGithubAccount(
        'U_EXISTING',
        'W_WORKSPACE',
        'newgithubuser',
      )

      // Assert
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.user.githubUsername).toBe('newgithubuser')
        expect(result.canonicalGithubUsername).toBe('newgithubuser')
      }
      expect(mockUserDao.update).toHaveBeenCalledTimes(1)
      expect(mockUserDao.create).not.toHaveBeenCalled()
    })

    it('returns github_user_not_found when GitHub user does not exist', async () => {
      // Arrange: GitHub user does not exist
      vi.mocked(mockGitHubClient.validateUser).mockResolvedValue({
        valid: false,
        reason: 'not_found',
        message: "GitHub user 'nonexistent' not found",
      })

      // Act
      const result = await userService.linkGithubAccount(
        'U_USER',
        'W_WORKSPACE',
        'nonexistent',
      )

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toBe('github_user_not_found')
        expect(result.message).toContain('nonexistent')
      }
      // Should not attempt any database operations
      expect(mockUserDao.findByGithubUsername).not.toHaveBeenCalled()
      expect(mockUserDao.findById).not.toHaveBeenCalled()
    })

    it('returns github_api_error when GitHub API fails with rate limit', async () => {
      // Arrange: GitHub API rate limited
      vi.mocked(mockGitHubClient.validateUser).mockResolvedValue({
        valid: false,
        reason: 'rate_limited',
        message: 'GitHub API rate limit exceeded',
      })

      // Act
      const result = await userService.linkGithubAccount(
        'U_USER',
        'W_WORKSPACE',
        'octocat',
      )

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toBe('github_api_error')
        expect(result.message).toContain('try again')
      }
    })

    it('returns github_api_error when GitHub API fails with generic error', async () => {
      // Arrange: GitHub API error
      vi.mocked(mockGitHubClient.validateUser).mockResolvedValue({
        valid: false,
        reason: 'api_error',
        message: 'GitHub API error: 500 Internal Server Error',
      })

      // Act
      const result = await userService.linkGithubAccount(
        'U_USER',
        'W_WORKSPACE',
        'octocat',
      )

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toBe('github_api_error')
      }
    })

    it('returns already_linked_to_other_user when GitHub username linked to different Slack user', async () => {
      // Arrange: GitHub user exists
      vi.mocked(mockGitHubClient.validateUser).mockResolvedValue(
        createGitHubValidationSuccess({ login: 'octocat' }),
      )
      // Arrange: This GitHub username is already linked to a DIFFERENT Slack user
      const otherUser = createTestUser({
        slackUserId: 'U_OTHER_USER',
        githubUsername: 'octocat',
      })
      vi.mocked(mockUserDao.findByGithubUsername).mockResolvedValue(otherUser)

      // Act: A different user tries to link the same GitHub account
      const result = await userService.linkGithubAccount(
        'U_NEW_USER',
        'W_WORKSPACE',
        'octocat',
      )

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toBe('already_linked_to_other_user')
        expect(result.message).toContain('already linked')
      }
      // Should not attempt to create or update
      expect(mockUserDao.findById).not.toHaveBeenCalled()
      expect(mockUserDao.create).not.toHaveBeenCalled()
      expect(mockUserDao.update).not.toHaveBeenCalled()
    })

    it('allows re-linking same user to same GitHub username (idempotent)', async () => {
      // Arrange: GitHub user exists
      vi.mocked(mockGitHubClient.validateUser).mockResolvedValue(
        createGitHubValidationSuccess({ login: 'octocat' }),
      )
      // Arrange: This user already has this GitHub username linked
      const existingUser = createTestUser({
        slackUserId: 'U_SAME_USER',
        githubUsername: 'octocat',
      })
      vi.mocked(mockUserDao.findByGithubUsername).mockResolvedValue(existingUser)
      vi.mocked(mockUserDao.findById).mockResolvedValue(existingUser)
      // Arrange: Update returns the same user (no real change)
      vi.mocked(mockUserDao.update).mockResolvedValue(existingUser)

      // Act: Same user re-links the same GitHub account
      const result = await userService.linkGithubAccount(
        'U_SAME_USER',
        'W_WORKSPACE',
        'octocat',
      )

      // Assert: Should succeed, not fail with already_linked_to_other_user
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.user.slackUserId).toBe('U_SAME_USER')
        expect(result.canonicalGithubUsername).toBe('octocat')
      }
    })

    it('uses canonical username from GitHub API (correct casing)', async () => {
      // Arrange: User provides lowercase, but GitHub returns correct casing
      vi.mocked(mockGitHubClient.validateUser).mockResolvedValue(
        createGitHubValidationSuccess({ login: 'OctoCat' }), // Note: different casing
      )
      vi.mocked(mockUserDao.findByGithubUsername).mockResolvedValue(null)
      vi.mocked(mockUserDao.findById).mockResolvedValue(null)
      const newUser = createTestUser({ githubUsername: 'OctoCat' })
      vi.mocked(mockUserDao.create).mockResolvedValue(newUser)

      // Act: User types 'octocat' (lowercase)
      const result = await userService.linkGithubAccount(
        'U_USER',
        'W_WORKSPACE',
        'octocat', // lowercase input
      )

      // Assert: Should use the canonical 'OctoCat' from GitHub
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.canonicalGithubUsername).toBe('OctoCat')
      }
      // Should look up using canonical username
      expect(mockUserDao.findByGithubUsername).toHaveBeenCalledWith('OctoCat')
    })

    it('returns database_error when DAO throws on create', async () => {
      // Arrange: GitHub user exists
      vi.mocked(mockGitHubClient.validateUser).mockResolvedValue(
        createGitHubValidationSuccess({ login: 'octocat' }),
      )
      vi.mocked(mockUserDao.findByGithubUsername).mockResolvedValue(null)
      vi.mocked(mockUserDao.findById).mockResolvedValue(null)
      // Arrange: Database throws an error
      vi.mocked(mockUserDao.create).mockRejectedValue(new Error('DynamoDB connection failed'))

      // Act
      const result = await userService.linkGithubAccount(
        'U_USER',
        'W_WORKSPACE',
        'octocat',
      )

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toBe('database_error')
        expect(result.message).toContain('try again')
      }
    })

    it('returns database_error when DAO throws on update', async () => {
      // Arrange: GitHub user exists
      vi.mocked(mockGitHubClient.validateUser).mockResolvedValue(
        createGitHubValidationSuccess({ login: 'octocat' }),
      )
      vi.mocked(mockUserDao.findByGithubUsername).mockResolvedValue(null)
      // Arrange: User exists
      const existingUser = createTestUser({ slackUserId: 'U_USER' })
      vi.mocked(mockUserDao.findById).mockResolvedValue(existingUser)
      // Arrange: Database throws on update
      vi.mocked(mockUserDao.update).mockRejectedValue(new Error('DynamoDB write failed'))

      // Act
      const result = await userService.linkGithubAccount(
        'U_USER',
        'W_WORKSPACE',
        'octocat',
      )

      // Assert
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.reason).toBe('database_error')
      }
    })
  })

  describe('getBySlackId', () => {
    it('returns user when found', async () => {
      const expectedUser = createTestUser({ slackUserId: 'U_USER' })
      vi.mocked(mockUserDao.findById).mockResolvedValue(expectedUser)

      const result = await userService.getBySlackId('U_USER')

      expect(result).toEqual(expectedUser)
      expect(mockUserDao.findById).toHaveBeenCalledWith('U_USER')
    })

    it('returns null when user not found', async () => {
      vi.mocked(mockUserDao.findById).mockResolvedValue(null)

      const result = await userService.getBySlackId('U_NONEXISTENT')

      expect(result).toBeNull()
    })
  })

  describe('getByGithubUsername', () => {
    it('returns user when found', async () => {
      const expectedUser = createTestUser({ githubUsername: 'octocat' })
      vi.mocked(mockUserDao.findByGithubUsername).mockResolvedValue(expectedUser)

      const result = await userService.getByGithubUsername('octocat')

      expect(result).toEqual(expectedUser)
      expect(mockUserDao.findByGithubUsername).toHaveBeenCalledWith('octocat')
    })

    it('returns null when user not found', async () => {
      vi.mocked(mockUserDao.findByGithubUsername).mockResolvedValue(null)

      const result = await userService.getByGithubUsername('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('updatePreferences', () => {
    it('merges partial preferences with existing ones', async () => {
      const existingUser = createTestUser({
        slackUserId: 'U_USER',
        preferences: {
          reviewRequests: true,
          reviewsOnMyPrs: true,
          commentsFromHumans: true,
          commentsFromBots: false,
          mentions: true,
          ciFailures: false,
        },
      })
      vi.mocked(mockUserDao.findById).mockResolvedValue(existingUser)

      const updatedUser = createTestUser({
        slackUserId: 'U_USER',
        preferences: {
          ...existingUser.preferences,
          ciFailures: true, // Changed
        },
      })
      vi.mocked(mockUserDao.update).mockResolvedValue(updatedUser)

      const result = await userService.updatePreferences('U_USER', { ciFailures: true })

      expect(result.preferences.ciFailures).toBe(true)
      expect(result.preferences.reviewRequests).toBe(true) // Other preferences preserved
    })

    it('throws when user not found', async () => {
      vi.mocked(mockUserDao.findById).mockResolvedValue(null)

      await expect(
        userService.updatePreferences('U_NONEXISTENT', { ciFailures: true }),
      ).rejects.toThrow('User not found')
    })
  })

  describe('unlinkAccount', () => {
    it('calls delete on the DAO', async () => {
      vi.mocked(mockUserDao.delete).mockResolvedValue(undefined)

      await userService.unlinkAccount('U_USER')

      expect(mockUserDao.delete).toHaveBeenCalledWith('U_USER')
    })
  })

  describe('hasNotificationEnabled', () => {
    it('returns true when notification type is enabled', () => {
      const user = createTestUser({
        preferences: {
          reviewRequests: true,
          reviewsOnMyPrs: true,
          commentsFromHumans: true,
          commentsFromBots: false,
          mentions: true,
          ciFailures: false,
        },
      })

      expect(userService.hasNotificationEnabled(user, 'reviewRequests')).toBe(true)
      expect(userService.hasNotificationEnabled(user, 'mentions')).toBe(true)
    })

    it('returns false when notification type is disabled', () => {
      const user = createTestUser({
        preferences: {
          reviewRequests: true,
          reviewsOnMyPrs: true,
          commentsFromHumans: true,
          commentsFromBots: false,
          mentions: true,
          ciFailures: false,
        },
      })

      expect(userService.hasNotificationEnabled(user, 'commentsFromBots')).toBe(false)
      expect(userService.hasNotificationEnabled(user, 'ciFailures')).toBe(false)
    })
  })
})
