import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestNotification, createTestUser } from '../testing/index'
import type { SlackBlock, User } from '../types/index'

import { NotificationServiceImpl } from './notification-service-impl'

describe('NotificationServiceImpl', () => {
  let service: NotificationServiceImpl

  beforeEach(() => {
    service = new NotificationServiceImpl()
    // Mock Date.now for consistent ID generation in tests
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T10:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('shouldNotify', () => {
    const createUserWithPreferences = (overrides: Partial<User['preferences']>): User => {
      return createTestUser({
        preferences: {
          reviewRequests: false,
          reviewsOnMyPrs: false,
          commentsFromHumans: false,
          commentsFromBots: false,
          mentions: false,
          ciFailures: false,
          ...overrides,
        },
      })
    }

    describe('review_requested notification type', () => {
      it('returns true when reviewRequests preference is enabled', () => {
        const user = createUserWithPreferences({ reviewRequests: true })
        expect(service.shouldNotify(user, 'review_requested', false)).toBe(true)
      })

      it('returns false when reviewRequests preference is disabled', () => {
        const user = createUserWithPreferences({ reviewRequests: false })
        expect(service.shouldNotify(user, 'review_requested', false)).toBe(false)
      })

      it('ignores isBot flag for review_requested', () => {
        const user = createUserWithPreferences({ reviewRequests: true })
        // isBot flag should not affect review_requested notifications
        expect(service.shouldNotify(user, 'review_requested', true)).toBe(true)
      })
    })

    describe('review_submitted notification type', () => {
      it('returns true when reviewsOnMyPrs preference is enabled', () => {
        const user = createUserWithPreferences({ reviewsOnMyPrs: true })
        expect(service.shouldNotify(user, 'review_submitted', false)).toBe(true)
      })

      it('returns false when reviewsOnMyPrs preference is disabled', () => {
        const user = createUserWithPreferences({ reviewsOnMyPrs: false })
        expect(service.shouldNotify(user, 'review_submitted', false)).toBe(false)
      })
    })

    describe('comment notification type', () => {
      it('returns true for human comments when commentsFromHumans is enabled', () => {
        const user = createUserWithPreferences({ commentsFromHumans: true })
        expect(service.shouldNotify(user, 'comment', false)).toBe(true)
      })

      it('returns false for human comments when commentsFromHumans is disabled', () => {
        const user = createUserWithPreferences({ commentsFromHumans: false })
        expect(service.shouldNotify(user, 'comment', false)).toBe(false)
      })

      it('returns true for bot comments when commentsFromBots is enabled', () => {
        const user = createUserWithPreferences({ commentsFromBots: true })
        expect(service.shouldNotify(user, 'comment', true)).toBe(true)
      })

      it('returns false for bot comments when commentsFromBots is disabled', () => {
        const user = createUserWithPreferences({ commentsFromBots: false })
        expect(service.shouldNotify(user, 'comment', true)).toBe(false)
      })

      it('distinguishes between bot and human comments correctly', () => {
        // Enable humans, disable bots
        const user = createUserWithPreferences({
          commentsFromHumans: true,
          commentsFromBots: false,
        })
        expect(service.shouldNotify(user, 'comment', false)).toBe(true)
        expect(service.shouldNotify(user, 'comment', true)).toBe(false)
      })
    })

    describe('mention notification type', () => {
      it('returns true when mentions preference is enabled', () => {
        const user = createUserWithPreferences({ mentions: true })
        expect(service.shouldNotify(user, 'mention', false)).toBe(true)
      })

      it('returns false when mentions preference is disabled', () => {
        const user = createUserWithPreferences({ mentions: false })
        expect(service.shouldNotify(user, 'mention', false)).toBe(false)
      })
    })

    describe('ci_failure notification type', () => {
      it('returns true when ciFailures preference is enabled', () => {
        const user = createUserWithPreferences({ ciFailures: true })
        expect(service.shouldNotify(user, 'ci_failure', false)).toBe(true)
      })

      it('returns false when ciFailures preference is disabled', () => {
        const user = createUserWithPreferences({ ciFailures: false })
        expect(service.shouldNotify(user, 'ci_failure', false)).toBe(false)
      })
    })
  })

  describe('buildSlackBlocks', () => {
    describe('header text based on notification type', () => {
      it('uses "Review Requested" header for review_requested type', () => {
        const notification = createTestNotification({ type: 'review_requested' })
        const blocks = service.buildSlackBlocks(notification)

        const header = blocks.find((b): b is SlackBlock & { type: 'header' } => b.type === 'header')
        expect(header?.text.text).toBe('Review Requested')
      })

      it('uses "New Comment" header for comment type', () => {
        const notification = createTestNotification({ type: 'comment' })
        const blocks = service.buildSlackBlocks(notification)

        const header = blocks.find((b): b is SlackBlock & { type: 'header' } => b.type === 'header')
        expect(header?.text.text).toBe('New Comment')
      })

      it('uses "You were mentioned!" header for mention type', () => {
        const notification = createTestNotification({ type: 'mention' })
        const blocks = service.buildSlackBlocks(notification)

        const header = blocks.find((b): b is SlackBlock & { type: 'header' } => b.type === 'header')
        expect(header?.text.text).toBe('You were mentioned!')
      })

      it('uses "CI Failed" header for ci_failure type', () => {
        const notification = createTestNotification({ type: 'ci_failure' })
        const blocks = service.buildSlackBlocks(notification)

        const header = blocks.find((b): b is SlackBlock & { type: 'header' } => b.type === 'header')
        expect(header?.text.text).toBe('CI Failed')
      })

      describe('review_submitted headers based on reviewState', () => {
        it('uses "PR Approved!" header when reviewState is approved', () => {
          const notification = createTestNotification({
            type: 'review_submitted',
            reviewState: 'approved',
          })
          const blocks = service.buildSlackBlocks(notification)

          const header = blocks.find((b): b is SlackBlock & { type: 'header' } => b.type === 'header')
          expect(header?.text.text).toBe('PR Approved!')
        })

        it('uses "Changes Requested" header when reviewState is changes_requested', () => {
          const notification = createTestNotification({
            type: 'review_submitted',
            reviewState: 'changes_requested',
          })
          const blocks = service.buildSlackBlocks(notification)

          const header = blocks.find((b): b is SlackBlock & { type: 'header' } => b.type === 'header')
          expect(header?.text.text).toBe('Changes Requested')
        })

        it('uses "PR Reviewed" header when reviewState is commented', () => {
          const notification = createTestNotification({
            type: 'review_submitted',
            reviewState: 'commented',
          })
          const blocks = service.buildSlackBlocks(notification)

          const header = blocks.find((b): b is SlackBlock & { type: 'header' } => b.type === 'header')
          expect(header?.text.text).toBe('PR Reviewed')
        })

        it('uses "PR Reviewed" header when reviewState is undefined', () => {
          const notification = createTestNotification({
            type: 'review_submitted',
            reviewState: undefined,
          })
          const blocks = service.buildSlackBlocks(notification)

          const header = blocks.find((b): b is SlackBlock & { type: 'header' } => b.type === 'header')
          expect(header?.text.text).toBe('PR Reviewed')
        })
      })
    })

    describe('PR info section', () => {
      it('includes PR title and number in the section', () => {
        const notification = createTestNotification({
          prTitle: 'Add awesome feature',
          prNumber: 123,
        })
        const blocks = service.buildSlackBlocks(notification)

        const sections = blocks.filter((b): b is SlackBlock & { type: 'section' } => b.type === 'section')
        const prInfoSection = sections.find(s => s.text?.text?.includes('Add awesome feature'))
        expect(prInfoSection).toBeDefined()
        expect(prInfoSection?.text?.text).toContain('PR #123')
      })
    })

    describe('comment body truncation', () => {
      it('includes comment body when present', () => {
        const notification = createTestNotification({
          commentBody: 'This is a short comment',
        })
        const blocks = service.buildSlackBlocks(notification)

        const sections = blocks.filter((b): b is SlackBlock & { type: 'section' } => b.type === 'section')
        const commentSection = sections.find(s => s.text?.text?.startsWith('>'))
        expect(commentSection).toBeDefined()
        expect(commentSection?.text?.text).toContain('This is a short comment')
      })

      it('truncates long comment bodies at word boundary', () => {
        const longComment = 'word '.repeat(100) // 500 characters total
        const notification = createTestNotification({
          commentBody: longComment,
        })
        const blocks = service.buildSlackBlocks(notification)

        const sections = blocks.filter((b): b is SlackBlock & { type: 'section' } => b.type === 'section')
        const commentSection = sections.find(s => s.text?.text?.startsWith('>'))
        expect(commentSection?.text?.text).toContain('...')
        // Should be truncated to ~200 chars for display
        expect(commentSection?.text?.text?.length).toBeLessThan(250)
      })

      it('does not include comment section when commentBody is undefined', () => {
        const notification = createTestNotification({
          commentBody: undefined,
        })
        const blocks = service.buildSlackBlocks(notification)

        const sections = blocks.filter((b): b is SlackBlock & { type: 'section' } => b.type === 'section')
        const commentSection = sections.find(s => s.text?.text?.startsWith('>'))
        expect(commentSection).toBeUndefined()
      })
    })

    describe('context with actor info', () => {
      it('includes actor avatar and username', () => {
        const notification = createTestNotification({
          actorGithubUsername: 'reviewer-user',
          actorAvatarUrl: 'https://github.com/avatars/123',
        })
        const blocks = service.buildSlackBlocks(notification)

        const context = blocks.find((b): b is SlackBlock & { type: 'context' } => b.type === 'context')
        expect(context).toBeDefined()
        expect(context?.elements).toContainEqual(
          expect.objectContaining({
            type: 'image',
            image_url: 'https://github.com/avatars/123',
            alt_text: 'reviewer-user',
          }),
        )
      })

      it('includes repository name in context', () => {
        const notification = createTestNotification({
          repository: 'octocat/hello-world',
        })
        const blocks = service.buildSlackBlocks(notification)

        const context = blocks.find((b): b is SlackBlock & { type: 'context' } => b.type === 'context')
        const repoElement = context?.elements?.find(
          (e): e is { type: 'mrkdwn'; text: string } =>
            e.type === 'mrkdwn' && e.text.includes('octocat/hello-world'),
        )
        expect(repoElement).toBeDefined()
      })
    })

    describe('branch info fields', () => {
      it('includes head and base branch refs', () => {
        const notification = createTestNotification({
          headRef: 'feature/awesome',
          baseRef: 'main',
        })
        const blocks = service.buildSlackBlocks(notification)

        const sectionWithFields = blocks.find(
          (b): b is SlackBlock & { type: 'section'; fields: Array<{ type: string; text: string }> } =>
            b.type === 'section' && Array.isArray(b.fields),
        )
        expect(sectionWithFields).toBeDefined()
        expect(sectionWithFields?.fields).toContainEqual(
          expect.objectContaining({ text: expect.stringContaining('feature/awesome') }),
        )
        expect(sectionWithFields?.fields).toContainEqual(
          expect.objectContaining({ text: expect.stringContaining('main') }),
        )
      })
    })

    describe('action buttons', () => {
      it('includes View Changes button with correct URL', () => {
        const notification = createTestNotification({
          prUrl: 'https://github.com/owner/repo/pull/42',
        })
        const blocks = service.buildSlackBlocks(notification)

        const actions = blocks.find((b): b is SlackBlock & { type: 'actions' } => b.type === 'actions')
        expect(actions).toBeDefined()
        const viewChangesButton = actions?.elements?.find(
          (e): e is { action_id: string; url: string } => e.action_id === 'view_changes',
        )
        expect(viewChangesButton?.url).toBe('https://github.com/owner/repo/pull/42/files')
      })

      it('includes Open PR button with correct URL and primary style', () => {
        const notification = createTestNotification({
          prUrl: 'https://github.com/owner/repo/pull/42',
        })
        const blocks = service.buildSlackBlocks(notification)

        const actions = blocks.find((b): b is SlackBlock & { type: 'actions' } => b.type === 'actions')
        const openPrButton = actions?.elements?.find(
          (e): e is { action_id: string; url: string; style?: string } => e.action_id === 'open_pr',
        )
        expect(openPrButton?.url).toBe('https://github.com/owner/repo/pull/42')
        expect(openPrButton?.style).toBe('primary')
      })
    })

    it('includes a divider block', () => {
      const notification = createTestNotification()
      const blocks = service.buildSlackBlocks(notification)

      const divider = blocks.find(b => b.type === 'divider')
      expect(divider).toBeDefined()
    })
  })

  describe('createReviewRequestNotification', () => {
    it('creates notification with correct fields', () => {
      const user = createTestUser({
        slackUserId: 'U_TARGET',
        slackWorkspaceId: 'W_WORKSPACE',
      })

      const notification = service.createReviewRequestNotification({
        targetUser: user,
        actorGithubUsername: 'requester',
        actorAvatarUrl: 'https://avatars.github.com/123',
        prNumber: 99,
        prTitle: 'Fix the bug',
        prUrl: 'https://github.com/org/repo/pull/99',
        repository: 'org/repo',
        headRef: 'fix-branch',
        baseRef: 'main',
      })

      expect(notification.type).toBe('review_requested')
      expect(notification.targetSlackUserId).toBe('U_TARGET')
      expect(notification.targetWorkspaceId).toBe('W_WORKSPACE')
      expect(notification.actorGithubUsername).toBe('requester')
      expect(notification.actorAvatarUrl).toBe('https://avatars.github.com/123')
      expect(notification.prNumber).toBe(99)
      expect(notification.prTitle).toBe('Fix the bug')
      expect(notification.prUrl).toBe('https://github.com/org/repo/pull/99')
      expect(notification.repository).toBe('org/repo')
      expect(notification.headRef).toBe('fix-branch')
      expect(notification.baseRef).toBe('main')
    })

    it('generates unique notification ID', () => {
      const user = createTestUser()
      const params = {
        targetUser: user,
        actorGithubUsername: 'requester',
        actorAvatarUrl: 'https://avatars.github.com/123',
        prNumber: 99,
        prTitle: 'Fix the bug',
        prUrl: 'https://github.com/org/repo/pull/99',
        repository: 'org/repo',
        headRef: 'fix-branch',
        baseRef: 'main',
      }

      const notification = service.createReviewRequestNotification(params)

      expect(notification.id).toMatch(/^notif_\d+_[a-z0-9]+$/)
    })

    it('sets createdAt to current ISO timestamp', () => {
      const user = createTestUser()
      const notification = service.createReviewRequestNotification({
        targetUser: user,
        actorGithubUsername: 'requester',
        actorAvatarUrl: 'https://avatars.github.com/123',
        prNumber: 99,
        prTitle: 'Fix the bug',
        prUrl: 'https://github.com/org/repo/pull/99',
        repository: 'org/repo',
        headRef: 'fix-branch',
        baseRef: 'main',
      })

      expect(notification.createdAt).toBe('2024-01-15T10:00:00.000Z')
    })
  })

  describe('createReviewSubmittedNotification', () => {
    it('creates notification with reviewState', () => {
      const user = createTestUser({
        slackUserId: 'U_AUTHOR',
        slackWorkspaceId: 'W_WORKSPACE',
      })

      const notification = service.createReviewSubmittedNotification({
        targetUser: user,
        actorGithubUsername: 'reviewer',
        actorAvatarUrl: 'https://avatars.github.com/456',
        prNumber: 100,
        prTitle: 'Add feature',
        prUrl: 'https://github.com/org/repo/pull/100',
        repository: 'org/repo',
        headRef: 'feature-branch',
        baseRef: 'develop',
        reviewState: 'approved',
      })

      expect(notification.type).toBe('review_submitted')
      expect(notification.reviewState).toBe('approved')
      expect(notification.targetSlackUserId).toBe('U_AUTHOR')
    })

    it('supports changes_requested reviewState', () => {
      const user = createTestUser()
      const notification = service.createReviewSubmittedNotification({
        targetUser: user,
        actorGithubUsername: 'reviewer',
        actorAvatarUrl: 'https://avatars.github.com/456',
        prNumber: 100,
        prTitle: 'Add feature',
        prUrl: 'https://github.com/org/repo/pull/100',
        repository: 'org/repo',
        headRef: 'feature-branch',
        baseRef: 'develop',
        reviewState: 'changes_requested',
      })

      expect(notification.reviewState).toBe('changes_requested')
    })

    it('supports commented reviewState', () => {
      const user = createTestUser()
      const notification = service.createReviewSubmittedNotification({
        targetUser: user,
        actorGithubUsername: 'reviewer',
        actorAvatarUrl: 'https://avatars.github.com/456',
        prNumber: 100,
        prTitle: 'Add feature',
        prUrl: 'https://github.com/org/repo/pull/100',
        repository: 'org/repo',
        headRef: 'feature-branch',
        baseRef: 'develop',
        reviewState: 'commented',
      })

      expect(notification.reviewState).toBe('commented')
    })
  })

  describe('createMentionNotification', () => {
    it('creates notification with commentBody and commentUrl', () => {
      const user = createTestUser({
        slackUserId: 'U_MENTIONED',
      })

      const notification = service.createMentionNotification({
        targetUser: user,
        actorGithubUsername: 'commenter',
        actorAvatarUrl: 'https://avatars.github.com/789',
        prNumber: 101,
        prTitle: 'Update docs',
        prUrl: 'https://github.com/org/repo/pull/101',
        repository: 'org/repo',
        headRef: 'docs-update',
        baseRef: 'main',
        commentBody: 'Hey @mentioned, please review this section',
        commentUrl: 'https://github.com/org/repo/pull/101#issuecomment-123',
      })

      expect(notification.type).toBe('mention')
      expect(notification.commentBody).toBe('Hey @mentioned, please review this section')
      expect(notification.commentUrl).toBe('https://github.com/org/repo/pull/101#issuecomment-123')
    })

    it('truncates long commentBody to 500 characters', () => {
      const user = createTestUser()
      const longComment = 'a'.repeat(600)

      const notification = service.createMentionNotification({
        targetUser: user,
        actorGithubUsername: 'commenter',
        actorAvatarUrl: 'https://avatars.github.com/789',
        prNumber: 101,
        prTitle: 'Update docs',
        prUrl: 'https://github.com/org/repo/pull/101',
        repository: 'org/repo',
        headRef: 'docs-update',
        baseRef: 'main',
        commentBody: longComment,
        commentUrl: 'https://github.com/org/repo/pull/101#issuecomment-123',
      })

      expect(notification.commentBody?.length).toBeLessThanOrEqual(503) // 500 + '...'
      expect(notification.commentBody).toContain('...')
    })
  })

  describe('createCommentNotification', () => {
    it('creates notification with comment type', () => {
      const user = createTestUser({
        slackUserId: 'U_PR_AUTHOR',
      })

      const notification = service.createCommentNotification({
        targetUser: user,
        actorGithubUsername: 'commenter',
        actorAvatarUrl: 'https://avatars.github.com/111',
        prNumber: 102,
        prTitle: 'Refactor code',
        prUrl: 'https://github.com/org/repo/pull/102',
        repository: 'org/repo',
        headRef: 'refactor-branch',
        baseRef: 'main',
        commentBody: 'Great work! Just one small suggestion.',
        commentUrl: 'https://github.com/org/repo/pull/102#discussion_r456',
      })

      expect(notification.type).toBe('comment')
      expect(notification.commentBody).toBe('Great work! Just one small suggestion.')
      expect(notification.commentUrl).toBe('https://github.com/org/repo/pull/102#discussion_r456')
      expect(notification.targetSlackUserId).toBe('U_PR_AUTHOR')
    })

    it('truncates long commentBody to 500 characters', () => {
      const user = createTestUser()
      const longComment = 'word '.repeat(150) // 750 characters

      const notification = service.createCommentNotification({
        targetUser: user,
        actorGithubUsername: 'commenter',
        actorAvatarUrl: 'https://avatars.github.com/111',
        prNumber: 102,
        prTitle: 'Refactor code',
        prUrl: 'https://github.com/org/repo/pull/102',
        repository: 'org/repo',
        headRef: 'refactor-branch',
        baseRef: 'main',
        commentBody: longComment,
        commentUrl: 'https://github.com/org/repo/pull/102#discussion_r456',
      })

      // Should be truncated at word boundary near 500 chars
      expect(notification.commentBody?.length).toBeLessThanOrEqual(503)
      expect(notification.commentBody).toContain('...')
    })
  })
})