/**
 * Usernames that look like @mentions but are not GitHub users.
 * These are common Slack/generic patterns that appear in PR comments.
 */
const FALSE_POSITIVE_MENTIONS = new Set([
  'mention',
  'all',
  'here',
  'channel',
  'everyone',
])

/**
 * Matches GitHub @username mentions in comment bodies.
 *
 * GitHub username rules:
 * - Alphanumeric characters or single hyphens
 * - Cannot start or end with a hyphen
 * - Maximum 39 characters
 * - Must be preceded by a non-alphanumeric character or start of string
 *   (avoids matching email addresses like user@github.com)
 */
const MENTION_PATTERN = /(?:^|[^a-zA-Z0-9])@([a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38})/g

/**
 * Extracts deduplicated, lowercased GitHub @mentions from a comment body.
 * Filters out common false positives like @here, @all, @channel.
 */
export function extractMentions(text: string): string[] {
  const mentions = new Set<string>()

  for (const match of text.matchAll(MENTION_PATTERN)) {
    const username = match[1]
    if (username && !FALSE_POSITIVE_MENTIONS.has(username.toLowerCase())) {
      mentions.add(username.toLowerCase())
    }
  }

  return [...mentions]
}
