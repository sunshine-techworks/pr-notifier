import type { Notification, NotificationType, ReviewState, SlackBlock, User } from '../types/index'

/**
 * Service interface for notification-related business logic
 */
export interface NotificationService {
  /**
   * Check if a notification should be sent based on user preferences
   */
  shouldNotify(user: User, notificationType: NotificationType, isBot: boolean): boolean

  /**
   * Build Slack blocks for a notification
   */
  buildSlackBlocks(notification: Notification): SlackBlock[]

  /**
   * Create a notification payload for review requested event
   */
  createReviewRequestNotification(params: {
    targetUser: User
    actorGithubUsername: string
    actorAvatarUrl: string
    actorIsBot: boolean
    prNumber: number
    prTitle: string
    prUrl: string
    repository: string
    headRef: string
    baseRef: string
  }): Notification

  /**
   * Create a notification payload for review submitted event
   */
  createReviewSubmittedNotification(params: {
    targetUser: User
    actorGithubUsername: string
    actorAvatarUrl: string
    actorIsBot: boolean
    prNumber: number
    prTitle: string
    prUrl: string
    repository: string
    headRef: string
    baseRef: string
    reviewState: ReviewState
    reviewUrl: string
  }): Notification

  /**
   * Create a notification payload for mention event
   */
  createMentionNotification(params: {
    targetUser: User
    actorGithubUsername: string
    actorAvatarUrl: string
    actorIsBot: boolean
    prNumber: number
    prTitle: string
    prUrl: string
    repository: string
    headRef: string
    baseRef: string
    commentBody: string
    commentUrl: string
  }): Notification

  /**
   * Create a notification payload for comment event
   */
  createCommentNotification(params: {
    targetUser: User
    actorGithubUsername: string
    actorAvatarUrl: string
    actorIsBot: boolean
    prNumber: number
    prTitle: string
    prUrl: string
    repository: string
    headRef: string
    baseRef: string
    commentBody: string
    commentUrl: string
  }): Notification
}
