import { z } from 'zod'

// --- Notification Preferences ---
export const notificationPreferencesSchema = z.object({
  reviewRequests: z.boolean(),
  reviewsOnMyPrs: z.boolean(),
  commentsFromHumans: z.boolean(),
  commentsFromBots: z.boolean(),
  mentions: z.boolean(),
  ciFailures: z.boolean(),
})

/** Notification preference toggles for a user */
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>

/** Default notification preferences for new users */
export const DEFAULT_PREFERENCES: NotificationPreferences = {
  reviewRequests: true,
  reviewsOnMyPrs: true,
  commentsFromHumans: true,
  commentsFromBots: false,
  mentions: true,
  ciFailures: false,
}

// --- Quiet Hours ---
export const quietHoursSchema = z.object({
  start: z.string(), // HH:mm format
  end: z.string(), // HH:mm format
  timezone: z.string(), // IANA timezone
})

/** Quiet hours configuration */
export type QuietHours = z.infer<typeof quietHoursSchema>

// --- User ---
export const userSchema = z.object({
  slackUserId: z.string(),
  slackWorkspaceId: z.string(),
  githubUsername: z.string(),
  preferences: notificationPreferencesSchema,
  quietHours: quietHoursSchema.optional(),
  digestEnabled: z.boolean(),
  digestTime: z.string().optional(), // HH:mm format
  timezone: z.string().optional(), // IANA timezone
  createdAt: z.string(), // ISO timestamp
  updatedAt: z.string(), // ISO timestamp
})

/** User entity representing a linked GitHub-Slack user */
export type User = z.infer<typeof userSchema>

// --- Workspace ---
export const workspaceTierSchema = z.enum(['free', 'pro', 'enterprise'])

/** Workspace tier for billing */
export type WorkspaceTier = z.infer<typeof workspaceTierSchema>

export const workspaceSchema = z.object({
  slackWorkspaceId: z.string(),
  name: z.string(),
  tier: workspaceTierSchema,
  // Per-workspace bot token from OAuth installation.
  // Optional during migration from single hardcoded token.
  slackBotToken: z.string().optional(),
  stripeCustomerId: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
  userCount: z.number(),
  billingEmail: z.string().optional(),
  installedAt: z.string(), // ISO timestamp
})

/** Workspace entity representing a Slack workspace installation */
export type Workspace = z.infer<typeof workspaceSchema>

// --- Notification ---
export const notificationTypeSchema = z.enum([
  'review_requested',
  'review_submitted',
  'comment',
  'mention',
  'ci_failure',
])

/** Types of notifications that can be sent */
export type NotificationType = z.infer<typeof notificationTypeSchema>

export const reviewStateSchema = z.enum(['approved', 'changes_requested', 'commented'])

/** Review state from GitHub */
export type ReviewState = z.infer<typeof reviewStateSchema>

export const notificationSchema = z.object({
  id: z.string(),
  type: notificationTypeSchema,
  targetSlackUserId: z.string(),
  targetWorkspaceId: z.string(),
  actorGithubUsername: z.string(),
  actorAvatarUrl: z.string(),
  actorIsBot: z.boolean(), // true if sender.type === 'Bot' or login ends with '[bot]'
  prNumber: z.number(),
  prTitle: z.string(),
  prUrl: z.string(),
  repository: z.string(), // owner/repo format
  headRef: z.string(),
  baseRef: z.string(),
  reviewState: reviewStateSchema.optional(),
  commentBody: z.string().optional(),
  commentUrl: z.string().optional(),
  createdAt: z.string(), // ISO timestamp
})

/** Notification payload to be queued and processed */
export type Notification = z.infer<typeof notificationSchema>
