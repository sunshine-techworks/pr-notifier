import { createHmac } from 'node:crypto'

/**
 * Generates a valid Slack request signature for testing signature verification.
 * Uses the same algorithm that Slack uses to sign their requests.
 */
export function generateSlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
): string {
  const sigBaseString = `v0:${timestamp}:${body}`
  const signature = createHmac('sha256', signingSecret)
    .update(sigBaseString)
    .digest('hex')
  return `v0=${signature}`
}

/**
 * Creates a valid timestamp for Slack signature verification.
 * Returns a timestamp within the 5-minute validity window.
 */
export function createValidTimestamp(): string {
  return String(Math.floor(Date.now() / 1000))
}

/**
 * Creates an expired timestamp for Slack signature verification.
 * Returns a timestamp that is older than the 5-minute validity window.
 */
export function createExpiredTimestamp(): string {
  // 6 minutes ago - outside the 5-minute window
  const sixMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 6
  return String(sixMinutesAgo)
}
