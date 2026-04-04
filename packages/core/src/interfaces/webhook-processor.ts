import type {
  IssueCommentEvent,
  PullRequestEvent,
  PullRequestReviewCommentEvent,
  PullRequestReviewEvent,
} from '../types/github-webhook.types'

/**
 * Reason why a notification was skipped during webhook processing.
 */
export interface SkippedNotification {
  /** Category of skip reason */
  reason:
    | 'self_notification'
    | 'user_not_found'
    | 'unsupported_action'
    | 'not_a_pr_comment'
    | 'preference_disabled'

  /** GitHub username of the target user (if known) */
  username?: string

  /** Event type being processed (e.g., 'pull_request', 'issue_comment') */
  eventType?: string

  /** Action from the webhook payload (e.g., 'edited', 'deleted') */
  action?: string

  /** Human-readable explanation for debugging */
  details?: string
}

/**
 * Result of processing a single webhook event.
 * Tracks how many notifications were sent and why some were skipped.
 */
export interface ProcessingResult {
  notificationsSent: number
  skipped: SkippedNotification[]
}

/**
 * Service for processing GitHub webhook events into notifications.
 * Handles user lookup, self-notification filtering, and queuing.
 */
export interface WebhookProcessor {
  /**
   * Process a pull_request webhook event.
   * Currently handles 'review_requested' action to notify the requested reviewer.
   */
  processPullRequestEvent(payload: PullRequestEvent): Promise<ProcessingResult>

  /**
   * Process a pull_request_review webhook event.
   * Handles 'submitted' action to notify the PR author about the review.
   */
  processPullRequestReviewEvent(payload: PullRequestReviewEvent): Promise<ProcessingResult>

  /**
   * Process a pull_request_review_comment webhook event.
   * Notifies PR author and any @mentioned users about the comment.
   */
  processPullRequestReviewCommentEvent(
    payload: PullRequestReviewCommentEvent,
  ): Promise<ProcessingResult>

  /**
   * Process an issue_comment webhook event.
   * Only processes comments on PRs (identified by issue.pull_request field).
   * Notifies PR author and any @mentioned users.
   */
  processIssueCommentEvent(payload: IssueCommentEvent): Promise<ProcessingResult>
}
