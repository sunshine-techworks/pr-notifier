import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verifies a Slack request signature using HMAC-SHA256.
 * Standalone pure function that only needs the app-level signing secret,
 * not a per-workspace bot token. This allows handlers to verify signatures
 * without constructing a full SlackClientImpl.
 */
export function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string,
): boolean {
  // Verify request is not too old (5 minutes)
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5
  if (parseInt(timestamp, 10) < fiveMinutesAgo) {
    return false
  }

  // Compute expected signature
  const sigBaseString = `v0:${timestamp}:${body}`
  const expectedSignature = 'v0='
    + createHmac('sha256', signingSecret)
      .update(sigBaseString)
      .digest('hex')

  // Guard against length mismatch which would throw from timingSafeEqual
  const sigBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)
  if (sigBuffer.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(sigBuffer, expectedBuffer)
}
