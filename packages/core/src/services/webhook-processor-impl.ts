import type { Logger } from '../interfaces/logger'
import type { NotificationQueue } from '../interfaces/notification-queue'
import type { NotificationService } from '../interfaces/notification-service'
import type { UserDao } from '../interfaces/user-dao'
import type {
  ProcessingResult,
  SkippedNotification,
  WebhookProcessor,
} from '../interfaces/webhook-processor'
import type {
  GitHubComment,
  GitHubPullRequest,
  GitHubRepository,
  GitHubUser,
  IssueCommentEvent,
  PullRequestEvent,
  PullRequestReviewCommentEvent,
  PullRequestReviewEvent,
} from '../types/github-webhook.types'
import type { Notification, NotificationType, ReviewState, User } from '../types/index'

import { extractMentions } from './mention-parser'

/**
 * Valid review states that map to our ReviewState type
 */
const VALID_REVIEW_STATES: ReadonlySet<string> = new Set<ReviewState>([
  'approved',
  'changes_requested',
  'commented',
])

/** Type guard to narrow GitHub review state string to our ReviewState union */
function isValidReviewState(state: string): state is ReviewState {
  return VALID_REVIEW_STATES.has(state)
}

/**
 * Processes GitHub webhook events into notifications.
 *
 * Handles user lookup, self-notification filtering, preference checks,
 * and queuing notifications to SQS. Each processing method returns a
 * ProcessingResult tracking sent/skipped notifications for observability.
 */
export class WebhookProcessorImpl implements WebhookProcessor {
  constructor(
    private readonly userDao: UserDao,
    private readonly notificationService: NotificationService,
    private readonly notificationQueue: NotificationQueue,
    private readonly logger: Logger,
  ) {}

  async processPullRequestEvent(payload: PullRequestEvent): Promise<ProcessingResult> {
    const log = this.logger.child({ event: 'pull_request', action: payload.action })

    if (payload.action !== 'review_requested') {
      return this.skippedResult({
        reason: 'unsupported_action',
        eventType: 'pull_request',
        action: payload.action,
      })
    }

    // Team review requests have requested_team instead of requested_reviewer
    if (!payload.requested_reviewer) {
      log.info('Skipping team review request (no individual reviewer)')
      return { notificationsSent: 0, skipped: [] }
    }

    return this.lookupAndNotify({
      targetGithubUsername: payload.requested_reviewer.login,
      sender: payload.sender,
      notificationType: 'review_requested',
      eventType: 'pull_request',
      action: payload.action,
      log,
      createNotification: (targetUser) =>
        this.notificationService.createReviewRequestNotification({
          targetUser,
          ...this.buildCommonParams(payload.sender, payload.pull_request, payload.repository),
        }),
    })
  }

  async processPullRequestReviewEvent(payload: PullRequestReviewEvent): Promise<ProcessingResult> {
    const log = this.logger.child({ event: 'pull_request_review', action: payload.action })

    if (payload.action !== 'submitted') {
      return this.skippedResult({
        reason: 'unsupported_action',
        eventType: 'pull_request_review',
        action: payload.action,
      })
    }

    // Only process review states we support (skip dismissed/pending)
    if (!isValidReviewState(payload.review.state)) {
      return this.skippedResult({
        reason: 'unsupported_action',
        eventType: 'pull_request_review',
        action: payload.action,
        details: `Unsupported review state: ${payload.review.state}`,
      })
    }

    const reviewState = payload.review.state

    return this.lookupAndNotify({
      targetGithubUsername: payload.pull_request.user.login,
      sender: payload.sender,
      notificationType: 'review_submitted',
      eventType: 'pull_request_review',
      action: payload.action,
      log,
      createNotification: (targetUser) =>
        this.notificationService.createReviewSubmittedNotification({
          targetUser,
          ...this.buildCommonParams(payload.sender, payload.pull_request, payload.repository),
          reviewState,
        }),
    })
  }

  async processPullRequestReviewCommentEvent(
    payload: PullRequestReviewCommentEvent,
  ): Promise<ProcessingResult> {
    const log = this.logger.child({ event: 'pull_request_review_comment', action: payload.action })

    if (payload.action !== 'created') {
      return this.skippedResult({
        reason: 'unsupported_action',
        eventType: 'pull_request_review_comment',
        action: payload.action,
      })
    }

    return this.processCommentWithMentions({
      sender: payload.sender,
      comment: payload.comment,
      prAuthorLogin: payload.pull_request.user.login,
      prNumber: payload.pull_request.number,
      prTitle: payload.pull_request.title,
      prUrl: payload.pull_request.html_url,
      repository: payload.repository.full_name,
      headRef: payload.pull_request.head.ref,
      baseRef: payload.pull_request.base.ref,
      eventType: 'pull_request_review_comment',
      log,
    })
  }

  async processIssueCommentEvent(payload: IssueCommentEvent): Promise<ProcessingResult> {
    const log = this.logger.child({ event: 'issue_comment', action: payload.action })

    if (payload.action !== 'created') {
      return this.skippedResult({
        reason: 'unsupported_action',
        eventType: 'issue_comment',
        action: payload.action,
      })
    }

    // Only process comments on PRs (issues have no pull_request field)
    if (!payload.issue.pull_request) {
      return this.skippedResult({
        reason: 'not_a_pr_comment',
        eventType: 'issue_comment',
        action: payload.action,
      })
    }

    return this.processCommentWithMentions({
      sender: payload.sender,
      comment: payload.comment,
      prAuthorLogin: payload.issue.user.login,
      prNumber: payload.issue.number,
      prTitle: payload.issue.title,
      prUrl: payload.issue.html_url,
      repository: payload.repository.full_name,
      // IssueCommentEvent lacks branch info since issue is not a full PR object
      headRef: '',
      baseRef: '',
      eventType: 'issue_comment',
      log,
    })
  }

  // --- Private helpers ---

  /**
   * Shared logic for comment events that can generate both comment and mention notifications.
   * Notifies the PR author (comment notification) and any @mentioned users (mention notifications).
   * Deduplicates: PR author won't get a separate mention if already receiving the comment notification.
   */
  private async processCommentWithMentions(params: {
    sender: GitHubUser
    comment: GitHubComment
    prAuthorLogin: string
    prNumber: number
    prTitle: string
    prUrl: string
    repository: string
    headRef: string
    baseRef: string
    eventType: string
    log: Logger
  }): Promise<ProcessingResult> {
    const {
      sender, comment, prAuthorLogin, prNumber, prTitle, prUrl,
      repository, headRef, baseRef, eventType, log,
    } = params

    const commonParams = {
      actorGithubUsername: sender.login,
      actorAvatarUrl: sender.avatar_url,
      actorIsBot: this.isBot(sender),
      prNumber,
      prTitle,
      prUrl,
      repository,
      headRef,
      baseRef,
    }

    let totalSent = 0
    const allSkipped: SkippedNotification[] = []

    // Notify the PR author about the comment
    const authorResult = await this.lookupAndNotify({
      targetGithubUsername: prAuthorLogin,
      sender,
      notificationType: 'comment',
      eventType,
      action: 'created',
      log,
      createNotification: (targetUser) =>
        this.notificationService.createCommentNotification({
          targetUser,
          ...commonParams,
          commentBody: comment.body,
          commentUrl: comment.html_url,
        }),
    })
    totalSent += authorResult.notificationsSent
    allSkipped.push(...authorResult.skipped)

    // Notify @mentioned users (excluding sender and PR author who already gets comment notif)
    const mentionedUsernames = extractMentions(comment.body)
    const senderLower = sender.login.toLowerCase()
    const authorLower = prAuthorLogin.toLowerCase()

    for (const username of mentionedUsernames) {
      // Skip the sender (self-mention) and PR author (already notified above)
      if (username === senderLower || username === authorLower) {
        continue
      }

      const mentionResult = await this.lookupAndNotify({
        targetGithubUsername: username,
        sender,
        notificationType: 'mention',
        eventType,
        action: 'created',
        log,
        createNotification: (targetUser) =>
          this.notificationService.createMentionNotification({
            targetUser,
            ...commonParams,
            commentBody: comment.body,
            commentUrl: comment.html_url,
          }),
      })
      totalSent += mentionResult.notificationsSent
      allSkipped.push(...mentionResult.skipped)
    }

    return { notificationsSent: totalSent, skipped: allSkipped }
  }

  /**
   * Core pipeline: look up user by GitHub username, apply filters, create and queue notification.
   * Returns a single-entry ProcessingResult.
   */
  private async lookupAndNotify(params: {
    targetGithubUsername: string
    sender: GitHubUser
    notificationType: NotificationType
    eventType: string
    action: string
    log: Logger
    createNotification: (targetUser: User) => Notification
  }): Promise<ProcessingResult> {
    const { targetGithubUsername, sender, notificationType, eventType, action, log } = params

    // Step 1: Look up user by GitHub username
    const user = await this.userDao.findByGithubUsername(targetGithubUsername)
    if (!user) {
      log.debug('Target user not registered', { username: targetGithubUsername })
      return this.skippedResult({
        reason: 'user_not_found',
        username: targetGithubUsername,
        eventType,
        action,
      })
    }

    // Step 2: Skip self-notifications (case-insensitive comparison)
    if (sender.login.toLowerCase() === targetGithubUsername.toLowerCase()) {
      log.debug('Skipping self-notification', { username: targetGithubUsername })
      return this.skippedResult({
        reason: 'self_notification',
        username: targetGithubUsername,
        eventType,
        action,
      })
    }

    // Step 3: Check user preferences
    const actorIsBot = this.isBot(sender)
    if (!this.notificationService.shouldNotify(user, notificationType, actorIsBot)) {
      log.debug('User preferences disabled this notification type', {
        username: targetGithubUsername,
        notificationType,
        isBot: actorIsBot,
      })
      return this.skippedResult({
        reason: 'preference_disabled',
        username: targetGithubUsername,
        eventType,
        action,
      })
    }

    // Step 4: Create and queue the notification
    const notification = params.createNotification(user)
    await this.notificationQueue.send(notification)

    log.info('Notification queued', {
      notificationId: notification.id,
      targetUser: targetGithubUsername,
      type: notificationType,
    })

    return { notificationsSent: 1, skipped: [] }
  }

  /** Detect bot actors using GitHub's sender.type field with [bot] suffix fallback */
  private isBot(sender: GitHubUser): boolean {
    return sender.type === 'Bot' || sender.login.endsWith('[bot]')
  }

  /** Extract common notification params from webhook payload fields */
  private buildCommonParams(
    sender: GitHubUser,
    pr: GitHubPullRequest,
    repository: GitHubRepository,
  ) {
    return {
      actorGithubUsername: sender.login,
      actorAvatarUrl: sender.avatar_url,
      actorIsBot: this.isBot(sender),
      prNumber: pr.number,
      prTitle: pr.title,
      prUrl: pr.html_url,
      repository: repository.full_name,
      headRef: pr.head.ref,
      baseRef: pr.base.ref,
    }
  }

  /** Convenience method to create a single-skip ProcessingResult */
  private skippedResult(skip: SkippedNotification): ProcessingResult {
    return { notificationsSent: 0, skipped: [skip] }
  }
}
