import { describe, expect, it } from 'vitest'

import { createSignedState, verifySignedState } from './oauth-state'

describe('OAuth state signing', () => {
  const secret = 'test-hmac-secret-key'
  const payload = {
    slackUserId: 'U12345678',
    slackWorkspaceId: 'W12345678',
    exp: Date.now() + 5 * 60 * 1000,
  }

  it('round-trips: create then verify returns original payload', () => {
    const state = createSignedState(payload, secret)
    const result = verifySignedState(state, secret)

    expect(result).toEqual(payload)
  })

  it('returns null for tampered payload', () => {
    const state = createSignedState(payload, secret)
    // Modify a character in the data portion (before the dot)
    const dotIndex = state.indexOf('.')
    const tampered = 'X' + state.substring(1, dotIndex) + state.substring(dotIndex)

    expect(verifySignedState(tampered, secret)).toBeNull()
  })

  it('returns null for tampered signature', () => {
    const state = createSignedState(payload, secret)
    const tampered = state.substring(0, state.length - 2) + 'XX'

    expect(verifySignedState(tampered, secret)).toBeNull()
  })

  it('returns null for expired state', () => {
    const expiredPayload = {
      ...payload,
      exp: Date.now() - 1000, // 1 second ago
    }
    const state = createSignedState(expiredPayload, secret)

    expect(verifySignedState(state, secret)).toBeNull()
  })

  it('returns null for wrong secret', () => {
    const state = createSignedState(payload, secret)

    expect(verifySignedState(state, 'wrong-secret')).toBeNull()
  })

  it('returns null for missing dot separator', () => {
    expect(verifySignedState('nodothere', secret)).toBeNull()
  })

  it('returns null for invalid JSON in payload', () => {
    expect(verifySignedState('bm90anNvbg.fakesig', secret)).toBeNull()
  })
})
