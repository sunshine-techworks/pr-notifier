// DAO interfaces
export type { UserDao } from './user-dao'
export type { WorkspaceDao } from './workspace-dao'

// Client interfaces
export type { SlackClient } from './slack-client'
export type { NotificationQueue } from './notification-queue'
export type {
  GitHubClient,
  GitHubUserValidationResult,
  GitHubUserValidationSuccess,
  GitHubUserValidationFailure,
} from './github-client'

// Service interfaces
export type {
  UserService,
  LinkAccountOutcome,
  LinkAccountSuccess,
  LinkAccountError,
} from './user-service'
export type { NotificationService } from './notification-service'