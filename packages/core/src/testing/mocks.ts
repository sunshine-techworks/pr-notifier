import { vi } from 'vitest'

import type { GitHubClient } from '../interfaces/github-client'
import type { NotificationQueue } from '../interfaces/notification-queue'
import type { NotificationService } from '../interfaces/notification-service'
import type { SlackClient } from '../interfaces/slack-client'
import type { UserDao } from '../interfaces/user-dao'
import type { UserService } from '../interfaces/user-service'
import type { WorkspaceDao } from '../interfaces/workspace-dao'

// --- DAO Mocks ---

/**
 * Creates a mock UserDao with all methods as vi.fn().
 * Use vi.mocked() to access mock methods for assertions.
 */
export function createMockUserDao(): UserDao {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findByGithubUsername: vi.fn(),
    findByWorkspaceId: vi.fn(),
    countByWorkspaceId: vi.fn(),
  }
}

/**
 * Creates a mock WorkspaceDao with all methods as vi.fn().
 */
export function createMockWorkspaceDao(): WorkspaceDao {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }
}

// --- Client Mocks ---

/**
 * Creates a mock GitHubClient with all methods as vi.fn().
 */
export function createMockGitHubClient(): GitHubClient {
  return {
    validateUser: vi.fn(),
  }
}

/**
 * Creates a mock SlackClient with all methods as vi.fn().
 */
export function createMockSlackClient(): SlackClient {
  return {
    sendDirectMessage: vi.fn(),
    sendChannelMessage: vi.fn(),
    updateMessage: vi.fn(),
    getUserInfo: vi.fn(),
    verifySignature: vi.fn(),
  }
}

/**
 * Creates a mock NotificationQueue with all methods as vi.fn().
 */
export function createMockNotificationQueue(): NotificationQueue {
  return {
    send: vi.fn(),
    sendBatch: vi.fn(),
  }
}

// --- Service Mocks ---

/**
 * Creates a mock UserService with all methods as vi.fn().
 */
export function createMockUserService(): UserService {
  return {
    linkGithubAccount: vi.fn(),
    getBySlackId: vi.fn(),
    getByGithubUsername: vi.fn(),
    updatePreferences: vi.fn(),
    unlinkAccount: vi.fn(),
    hasNotificationEnabled: vi.fn(),
  }
}

/**
 * Creates a mock NotificationService with all methods as vi.fn().
 */
export function createMockNotificationService(): NotificationService {
  return {
    shouldNotify: vi.fn(),
    buildSlackBlocks: vi.fn(),
    createReviewRequestNotification: vi.fn(),
    createReviewSubmittedNotification: vi.fn(),
    createMentionNotification: vi.fn(),
    createCommentNotification: vi.fn(),
  }
}

// --- AWS SDK Mocks ---

/**
 * Mock type for SQS client - only includes the send method we need for testing.
 * This matches the subset of SQSClient interface used by NotificationQueueImpl.
 */
export interface MockSQSClient {
  send: ReturnType<typeof vi.fn>
}

/**
 * Creates a mock SQS client with a mocked send method.
 * Use vi.mocked() to set up return values for specific commands.
 */
export function createMockSQSClient(): MockSQSClient {
  return {
    send: vi.fn(),
  }
}

/**
 * Mock type for DynamoDB Document client - only includes the send method we need for testing.
 * This matches the subset of DynamoDBDocumentClient interface used by DAO implementations.
 */
export interface MockDynamoDBDocumentClient {
  send: ReturnType<typeof vi.fn>
}

/**
 * Creates a mock DynamoDB Document client with a mocked send method.
 * Use vi.mocked() to set up return values for specific commands.
 */
export function createMockDynamoDBDocumentClient(): MockDynamoDBDocumentClient {
  return {
    send: vi.fn(),
  }
}
