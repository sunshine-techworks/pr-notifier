import type { GitHubUserValidationSuccess } from '../interfaces/github-client'
import type { Notification, User, Workspace } from '../types/index'
import { DEFAULT_PREFERENCES } from '../types/index'

// --- User Factory ---

/**
 * Creates a test User entity with sensible defaults.
 * All fields can be overridden via the overrides parameter.
 */
export function createTestUser(overrides?: Partial<User>): User {
  const now = new Date().toISOString()

  return {
    slackUserId: 'U12345678',
    slackWorkspaceId: 'W12345678',
    githubUsername: 'testuser',
    preferences: { ...DEFAULT_PREFERENCES },
    digestEnabled: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

// --- Workspace Factory ---

/**
 * Creates a test Workspace entity with sensible defaults.
 */
export function createTestWorkspace(overrides?: Partial<Workspace>): Workspace {
  return {
    slackWorkspaceId: 'W12345678',
    name: 'Test Workspace',
    tier: 'free',
    userCount: 0,
    installedAt: new Date().toISOString(),
    ...overrides,
  }
}

// --- Notification Factory ---

/**
 * Creates a test Notification entity with sensible defaults.
 */
export function createTestNotification(overrides?: Partial<Notification>): Notification {
  return {
    id: 'notif-12345',
    type: 'review_requested',
    targetSlackUserId: 'U12345678',
    targetWorkspaceId: 'W12345678',
    actorGithubUsername: 'reviewer',
    actorAvatarUrl: 'https://avatars.githubusercontent.com/u/123?v=4',
    prNumber: 42,
    prTitle: 'Add new feature',
    prUrl: 'https://github.com/owner/repo/pull/42',
    repository: 'owner/repo',
    headRef: 'feature-branch',
    baseRef: 'main',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

// --- GitHub API Response Factory ---

/**
 * Raw GitHub API response shape for the /users/:username endpoint
 */
export interface GitHubApiUserResponse {
  login: string
  id: number
  avatar_url: string
  name: string | null
  type: 'User' | 'Organization' | 'Bot'
}

/**
 * Creates a mock GitHub API user response.
 * This is the raw JSON format returned by the GitHub API.
 */
export function createGitHubUserResponse(
  overrides?: Partial<GitHubApiUserResponse>,
): GitHubApiUserResponse {
  return {
    login: 'octocat',
    id: 583231,
    avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
    name: 'The Octocat',
    type: 'User',
    ...overrides,
  }
}

/**
 * Creates a successful GitHubUserValidationResult.
 * Use this when mocking GitHubClient.validateUser to return success.
 */
export function createGitHubValidationSuccess(
  overrides?: Partial<GitHubUserValidationSuccess['user']>,
): GitHubUserValidationSuccess {
  return {
    valid: true,
    user: {
      login: 'octocat',
      id: 583231,
      avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
      name: 'The Octocat',
      type: 'User',
      ...overrides,
    },
  }
}
