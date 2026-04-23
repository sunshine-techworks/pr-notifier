import type { NotificationService } from '../interfaces/index'
import type {
  Notification,
  NotificationType,
  ReviewState,
  SlackBlock,
  SlackButtonElement,
  User,
} from '../types/index'

/**
 * Implementation of NotificationService
 */
export class NotificationServiceImpl implements NotificationService {
  shouldNotify(user: User, notificationType: NotificationType, isBot: boolean): boolean {
    const { preferences } = user

    switch (notificationType) {
      case 'review_requested':
        return preferences.reviewRequests
      case 'review_submitted':
        return preferences.reviewsOnMyPrs
      case 'comment':
        return isBot ? preferences.commentsFromBots : preferences.commentsFromHumans
      case 'mention':
        return preferences.mentions
      case 'ci_failure':
        return preferences.ciFailures
      default:
        return false
    }
  }

  buildSlackBlocks(notification: Notification): SlackBlock[] {
    const headerText = this.getHeaderText(notification.type, notification.reviewState)
    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: headerText, emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${notification.prTitle}*\nPR #${notification.prNumber}`,
        },
      },
    ]

    // Add comment body if present (truncated)
    if (notification.commentBody) {
      const truncatedBody = this.truncateText(notification.commentBody, 200)
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `> ${truncatedBody}` },
      })
    }

    // Add context with actor info
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'image',
          image_url: notification.actorAvatarUrl,
          alt_text: notification.actorGithubUsername,
        },
        {
          type: 'mrkdwn',
          text: `${
            this.getActionText(notification.type, notification.reviewState)
          } *${notification.actorGithubUsername}*`,
        },
        {
          type: 'image',
          image_url: `https://github.com/${notification.repository.split('/')[0]}.png`,
          alt_text: notification.repository,
        },
        {
          type: 'mrkdwn',
          text: `*${notification.repository}*`,
        },
      ],
    })

    blocks.push({ type: 'divider' })

    // Only show branch info when available (issue_comment events lack branch refs)
    if (notification.headRef && notification.baseRef) {
      blocks.push({
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Branch:*\n\`${notification.headRef}\`` },
          { type: 'mrkdwn', text: `*Target:*\n\`${notification.baseRef}\`` },
        ],
      })
    }

    // Add contextual action buttons based on notification type
    blocks.push({
      type: 'actions',
      elements: this.getActionButtons(notification),
    })

    return blocks
  }

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
  }): Notification {
    return {
      id: this.generateId(),
      type: 'review_requested',
      targetSlackUserId: params.targetUser.slackUserId,
      targetWorkspaceId: params.targetUser.slackWorkspaceId,
      actorGithubUsername: params.actorGithubUsername,
      actorAvatarUrl: params.actorAvatarUrl,
      actorIsBot: params.actorIsBot,
      prNumber: params.prNumber,
      prTitle: params.prTitle,
      prUrl: params.prUrl,
      repository: params.repository,
      headRef: params.headRef,
      baseRef: params.baseRef,
      createdAt: new Date().toISOString(),
    }
  }

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
  }): Notification {
    return {
      id: this.generateId(),
      type: 'review_submitted',
      targetSlackUserId: params.targetUser.slackUserId,
      targetWorkspaceId: params.targetUser.slackWorkspaceId,
      actorGithubUsername: params.actorGithubUsername,
      actorAvatarUrl: params.actorAvatarUrl,
      actorIsBot: params.actorIsBot,
      prNumber: params.prNumber,
      prTitle: params.prTitle,
      prUrl: params.prUrl,
      repository: params.repository,
      headRef: params.headRef,
      baseRef: params.baseRef,
      reviewState: params.reviewState,
      // Store review URL in commentUrl field for the deep-link button
      commentUrl: params.reviewUrl,
      createdAt: new Date().toISOString(),
    }
  }

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
  }): Notification {
    return {
      id: this.generateId(),
      type: 'mention',
      targetSlackUserId: params.targetUser.slackUserId,
      targetWorkspaceId: params.targetUser.slackWorkspaceId,
      actorGithubUsername: params.actorGithubUsername,
      actorAvatarUrl: params.actorAvatarUrl,
      actorIsBot: params.actorIsBot,
      prNumber: params.prNumber,
      prTitle: params.prTitle,
      prUrl: params.prUrl,
      repository: params.repository,
      headRef: params.headRef,
      baseRef: params.baseRef,
      commentBody: this.truncateText(params.commentBody, 500),
      commentUrl: params.commentUrl,
      createdAt: new Date().toISOString(),
    }
  }

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
  }): Notification {
    return {
      id: this.generateId(),
      type: 'comment',
      targetSlackUserId: params.targetUser.slackUserId,
      targetWorkspaceId: params.targetUser.slackWorkspaceId,
      actorGithubUsername: params.actorGithubUsername,
      actorAvatarUrl: params.actorAvatarUrl,
      actorIsBot: params.actorIsBot,
      prNumber: params.prNumber,
      prTitle: params.prTitle,
      prUrl: params.prUrl,
      repository: params.repository,
      headRef: params.headRef,
      baseRef: params.baseRef,
      commentBody: this.truncateText(params.commentBody, 500),
      commentUrl: params.commentUrl,
      createdAt: new Date().toISOString(),
    }
  }

  private getHeaderText(type: NotificationType, reviewState?: ReviewState): string {
    switch (type) {
      case 'review_requested':
        return 'Review Requested'
      case 'review_submitted':
        switch (reviewState) {
          case 'approved':
            return 'PR Approved!'
          case 'changes_requested':
            return 'Changes Requested'
          case 'commented':
            return 'PR Reviewed'
          default:
            return 'PR Reviewed'
        }
      case 'comment':
        return 'New Comment'
      case 'mention':
        return 'You were mentioned!'
      case 'ci_failure':
        return 'CI Failed'
      default:
        return 'Notification'
    }
  }

  private getActionText(type: NotificationType, reviewState?: ReviewState): string {
    switch (type) {
      case 'review_requested':
        return 'Requested by'
      case 'review_submitted':
        switch (reviewState) {
          case 'approved':
            return 'Approved by'
          case 'changes_requested':
            return 'Changes requested by'
          default:
            return 'Reviewed by'
        }
      case 'comment':
        return 'Comment from'
      case 'mention':
        return 'Mentioned by'
      case 'ci_failure':
        return 'Triggered by'
      default:
        return 'By'
    }
  }

  /**
   * Returns contextual action buttons based on notification type.
   * Each type gets a primary action that deep-links to the relevant
   * activity (review, comment, mention) plus a secondary "Open PR" button.
   */
  private getActionButtons(notification: Notification): SlackButtonElement[] {
    const openPrButton: SlackButtonElement = {
      type: 'button',
      text: { type: 'plain_text', text: 'Open PR', emoji: true },
      action_id: 'open_pr',
      url: notification.prUrl,
    }

    switch (notification.type) {
      case 'review_requested':
        return [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Review Changes', emoji: true },
            action_id: 'view_changes',
            url: `${notification.prUrl}/files`,
            style: 'primary',
          },
          openPrButton,
        ]

      case 'review_submitted':
        return [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Review', emoji: true },
            action_id: 'view_review',
            url: notification.commentUrl ?? notification.prUrl,
            style: 'primary',
          },
          openPrButton,
        ]

      case 'comment':
        return [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Comment', emoji: true },
            action_id: 'view_comment',
            url: notification.commentUrl ?? notification.prUrl,
            style: 'primary',
          },
          openPrButton,
        ]

      case 'mention':
        return [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Mention', emoji: true },
            action_id: 'view_mention',
            url: notification.commentUrl ?? notification.prUrl,
            style: 'primary',
          },
          openPrButton,
        ]

      case 'ci_failure':
        return [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Failure', emoji: true },
            action_id: 'view_failure',
            url: notification.commentUrl ?? notification.prUrl,
            style: 'primary',
          },
          openPrButton,
        ]

      default:
        return [openPrButton]
    }
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text
    }
    const truncated = text.substring(0, maxLength)
    const lastSpace = truncated.lastIndexOf(' ')
    return (lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated) + '...'
  }

  private generateId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }
}
