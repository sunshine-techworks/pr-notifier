// DAO interfaces
export type { UserDao } from './user-dao'
export type { WorkspaceDao } from './workspace-dao'

// Client interfaces
export type {
  GitHubClient,
  GitHubUserValidationFailure,
  GitHubUserValidationResult,
  GitHubUserValidationSuccess,
} from './github-client'
export type { NotificationQueue } from './notification-queue'
export type { SlackClient } from './slack-client'

// Service interfaces
export type { NotificationService } from './notification-service'
export type {
  LinkAccountError,
  LinkAccountOutcome,
  LinkAccountSuccess,
  UserService,
} from './user-service'
