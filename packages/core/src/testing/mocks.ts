import { vi } from 'vitest'

import type { GitHubClient } from '../interfaces/github-client'
import type { Logger } from '../interfaces/logger'
import type { NotificationQueue } from '../interfaces/notification-queue'
import type { NotificationService } from '../interfaces/notification-service'
import type { OAuthService } from '../interfaces/oauth-service'
import type { PrThreadDao } from '../interfaces/pr-thread-dao'
import type { SlackClient } from '../interfaces/slack-client'
import type { SlackClientFactory } from '../interfaces/slack-client-factory'
import type { UserDao } from '../interfaces/user-dao'
import type { UserService } from '../interfaces/user-service'
import type { WebhookProcessor } from '../interfaces/webhook-processor'
import type { WorkspaceDao } from '../interfaces/workspace-dao'
import type { WorkspaceService } from '../interfaces/workspace-service'

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

/**
 * Creates a mock PrThreadDao with all methods as vi.fn().
 */
export function createMockPrThreadDao(): PrThreadDao {
  return {
    findThread: vi.fn(),
    createThread: vi.fn(),
  }
}

/**
 * Creates a mock WorkspaceService with all methods as vi.fn().
 */
export function createMockWorkspaceService(): WorkspaceService {
  return {
    getById: vi.fn(),
    registerInstallation: vi.fn(),
    removeInstallation: vi.fn(),
  }
}

// --- Client Mocks ---

/**
 * Creates a mock OAuthService with all methods as vi.fn().
 */
export function createMockOAuthService(): OAuthService {
  return {
    getAuthorizationUrl: vi.fn(),
    exchangeCodeForToken: vi.fn(),
  }
}

/**
 * Creates a mock SlackClientFactory with getClientForWorkspace as vi.fn().
 */
export function createMockSlackClientFactory(): SlackClientFactory {
  return {
    getClientForWorkspace: vi.fn(),
  }
}

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
    publishAppHome: vi.fn(),
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

/**
 * Creates a mock WebhookProcessor with all methods as vi.fn().
 */
export function createMockWebhookProcessor(): WebhookProcessor {
  return {
    processPullRequestEvent: vi.fn(),
    processPullRequestReviewEvent: vi.fn(),
    processPullRequestReviewCommentEvent: vi.fn(),
    processIssueCommentEvent: vi.fn(),
  }
}

/**
 * Creates a mock Logger where child() returns the same mock instance.
 * This allows chained calls like logger.child({}).info() to work in tests.
 */
export function createMockLogger(): Logger {
  const logger: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  }
  // child() returns the same logger so chained calls work in tests
  vi.mocked(logger.child).mockReturnValue(logger)
  return logger
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
