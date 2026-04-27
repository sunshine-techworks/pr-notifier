import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Payload encoded in the OAuth state parameter.
 * Carries Slack user context from the link command to the OAuth callback.
 */
export interface OAuthStatePayload {
  slackUserId: string
  slackWorkspaceId: string
  /** Expiry timestamp in milliseconds */
  exp: number
}

/**
 * Creates an HMAC-signed OAuth state parameter.
 * Format: base64url(json) + "." + base64url(hmac-sha256)
 *
 * This avoids storing state in DynamoDB. The callback verifies the
 * signature to ensure the state was created by us and hasn't been
 * tampered with, then checks the expiry timestamp.
 */
export function createSignedState(payload: OAuthStatePayload, secret: string): string {
  const json = JSON.stringify(payload)
  const data = Buffer.from(json).toString('base64url')
  const signature = createHmac('sha256', secret).update(data).digest('base64url')
  return `${data}.${signature}`
}

/**
 * Verifies and decodes an HMAC-signed OAuth state parameter.
 * Returns the payload if valid and not expired, or null otherwise.
 */
export function verifySignedState(state: string, secret: string): OAuthStatePayload | null {
  const dotIndex = state.indexOf('.')
  if (dotIndex === -1) {
    return null
  }

  const data = state.substring(0, dotIndex)
  const signature = state.substring(dotIndex + 1)

  // Verify HMAC signature
  const expectedSignature = createHmac('sha256', secret).update(data).digest('base64url')

  const sigBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)
  if (sigBuffer.length !== expectedBuffer.length) {
    return null
  }

  if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null
  }

  // Decode and parse payload
  try {
    const json = Buffer.from(data, 'base64url').toString('utf-8')
    const payload: unknown = JSON.parse(json)

    // Type guard for the payload shape
    const isRecord = (val: unknown): val is Record<string, unknown> =>
      typeof val === 'object' && val !== null

    if (
      !isRecord(payload)
      || typeof payload['slackUserId'] !== 'string'
      || typeof payload['slackWorkspaceId'] !== 'string'
      || typeof payload['exp'] !== 'number'
    ) {
      return null
    }

    // Check expiry
    if (payload['exp'] <= Date.now()) {
      return null
    }

    return {
      slackUserId: payload['slackUserId'],
      slackWorkspaceId: payload['slackWorkspaceId'],
      exp: payload['exp'],
    }
  } catch {
    return null
  }
}
