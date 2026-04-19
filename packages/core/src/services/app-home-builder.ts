import type { NotificationPreferences, User } from '../types/entities'
import type { SlackBlock, SlackOption } from '../types/slack.types'

/**
 * Maps preference keys to human-readable labels shown in the checkbox group.
 * Order here determines the display order in the App Home.
 */
const PREFERENCE_LABELS: ReadonlyArray<
  { key: keyof NotificationPreferences; label: string; description: string }
> = [
  {
    key: 'reviewRequests',
    label: 'Review requests',
    description: 'Someone requests your review on a PR',
  },
  {
    key: 'reviewsOnMyPrs',
    label: 'Reviews on my PRs',
    description: 'Someone approves, comments, or requests changes',
  },
  {
    key: 'commentsFromHumans',
    label: 'Comments from humans',
    description: 'Human comments on PRs you authored',
  },
  {
    key: 'commentsFromBots',
    label: 'Comments from bots',
    description: 'Bot comments (CI, coverage, linting)',
  },
  {
    key: 'mentions',
    label: '@mentions',
    description: 'You are mentioned in a PR description or comment',
  },
  { key: 'ciFailures', label: 'CI failures', description: 'CI/checks fail on PRs you authored' },
]

/**
 * Builds the Slack Block Kit blocks for the App Home tab.
 * Pure function with no side effects — takes a user (or null for unlinked state)
 * and returns the complete set of blocks for views.publish.
 */
export function buildAppHomeBlocks(user: User | null): SlackBlock[] {
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'PR Notify Settings', emoji: true },
    },
  ]

  if (!user) {
    // Unlinked state — prompt user to link their account
    blocks.push(
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "You haven't linked your GitHub account yet.",
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Use `/pr-notify link <github-username>` to get started.',
        },
      },
    )
    return blocks
  }

  // Linked state — show account info, preferences, and unlink button
  blocks.push(
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Linked to:* \`@${user.githubUsername}\``,
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Notification Preferences*\nSelect which notifications you want to receive via DM.',
      },
    },
  )

  // Build checkbox options from the preference labels
  const allOptions = PREFERENCE_LABELS.map(({ key, label, description }): SlackOption => ({
    text: { type: 'mrkdwn', text: `*${label}*` },
    description: { type: 'mrkdwn', text: description },
    value: key,
  }))

  // Only include options where the user has the preference enabled
  const initialOptions = PREFERENCE_LABELS
    .filter(({ key }) => user.preferences[key])
    .map(({ key, label, description }): SlackOption => ({
      text: { type: 'mrkdwn', text: `*${label}*` },
      description: { type: 'mrkdwn', text: description },
      value: key,
    }))

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'checkboxes',
        action_id: 'notification_preferences',
        options: allOptions,
        // Only set initial_options when there are enabled preferences
        ...(initialOptions.length > 0 ? { initial_options: initialOptions } : {}),
      },
    ],
  })

  blocks.push(
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Unlink Account', emoji: true },
          action_id: 'unlink_account',
          style: 'danger',
        },
      ],
    },
  )

  return blocks
}
