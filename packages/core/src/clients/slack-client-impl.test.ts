import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createExpiredTimestamp,
  createValidTimestamp,
  generateSlackSignature,
} from '../testing/index'

import { SlackClientImpl } from './slack-client-impl'

/**
 * Type for the mocked WebClient methods we use in tests.
 * Matches the subset of WebClient interface used by SlackClientImpl.
 */
interface MockWebClientMethods {
  chat: {
    postMessage: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  users: {
    info: ReturnType<typeof vi.fn>
  }
  views: {
    publish: ReturnType<typeof vi.fn>
  }
}

// Create mock methods that we can reference in tests
const mockChatPostMessage = vi.fn()
const mockChatUpdate = vi.fn()
const mockUsersInfo = vi.fn()
const mockViewsPublish = vi.fn()

// Mock the @slack/web-api module
vi.mock('@slack/web-api', () => {
  return {
    WebClient: vi.fn().mockImplementation((): MockWebClientMethods => ({
      chat: {
        postMessage: mockChatPostMessage,
        update: mockChatUpdate,
      },
      users: {
        info: mockUsersInfo,
      },
      views: {
        publish: mockViewsPublish,
      },
    })),
  }
})

describe('SlackClientImpl', () => {
  const botToken = 'xoxb-test-token'
  const signingSecret = 'test-signing-secret'
  let client: SlackClientImpl

  beforeEach(() => {
    vi.clearAllMocks()
    client = new SlackClientImpl(botToken, signingSecret)
  })

  describe('sendDirectMessage', () => {
    it('sends message successfully and returns ok response', async () => {
      mockChatPostMessage.mockResolvedValue({
        ok: true,
        channel: 'D12345678',
        ts: '1234567890.123456',
      })

      const result = await client.sendDirectMessage('U12345678', {
        text: 'Hello!',
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Hello!' } }],
      })

      expect(result.ok).toBe(true)
      expect(result.channel).toBe('D12345678')
      expect(result.ts).toBe('1234567890.123456')
      expect(mockChatPostMessage).toHaveBeenCalledWith({
        channel: 'U12345678',
        text: 'Hello!',
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Hello!' } }],
      })
    })

    it('returns ok false when API returns ok: false', async () => {
      mockChatPostMessage.mockResolvedValue({
        ok: false,
      })

      const result = await client.sendDirectMessage('U12345678', { text: 'Hello!' })

      expect(result.ok).toBe(false)
    })

    it('returns error message when API throws exception', async () => {
      mockChatPostMessage.mockRejectedValue(new Error('channel_not_found'))

      const result = await client.sendDirectMessage('U_INVALID', { text: 'Hello!' })

      expect(result.ok).toBe(false)
      expect(result.error).toBe('channel_not_found')
    })

    it('returns "Unknown error" when API throws non-Error exception', async () => {
      mockChatPostMessage.mockRejectedValue('string error')

      const result = await client.sendDirectMessage('U12345678', { text: 'Hello!' })

      expect(result.ok).toBe(false)
      expect(result.error).toBe('Unknown error')
    })

    it('does not include channel/ts in response when not present', async () => {
      mockChatPostMessage.mockResolvedValue({
        ok: true,
        // No channel or ts in response
      })

      const result = await client.sendDirectMessage('U12345678', { text: 'Hello!' })

      expect(result.ok).toBe(true)
      expect(result.channel).toBeUndefined()
      expect(result.ts).toBeUndefined()
    })

    it('forwards threadTs as thread_ts when posting a threaded reply', async () => {
      mockChatPostMessage.mockResolvedValue({ ok: true, channel: 'D1', ts: '2.0' })

      await client.sendDirectMessage('U12345678', {
        text: 'reply',
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'reply' } }],
        threadTs: '1700000000.000100',
      })

      expect(mockChatPostMessage).toHaveBeenCalledWith({
        channel: 'U12345678',
        text: 'reply',
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'reply' } }],
        thread_ts: '1700000000.000100',
      })
    })

    it('omits thread_ts entirely when threadTs is not provided', async () => {
      mockChatPostMessage.mockResolvedValue({ ok: true })

      await client.sendDirectMessage('U12345678', {
        text: 'top-level',
        blocks: [],
      })

      const args = mockChatPostMessage.mock.calls[0][0]
      // Sending an explicit thread_ts: undefined would let Slack treat the
      // call as a threaded reply with a missing parent — verify it is absent.
      expect('thread_ts' in args).toBe(false)
    })
  })

  describe('sendChannelMessage', () => {
    it('sends message to channel successfully', async () => {
      mockChatPostMessage.mockResolvedValue({
        ok: true,
        channel: 'C12345678',
        ts: '1234567890.654321',
      })

      const result = await client.sendChannelMessage('C12345678', {
        text: 'Channel message',
      })

      expect(result.ok).toBe(true)
      expect(result.channel).toBe('C12345678')
      expect(mockChatPostMessage).toHaveBeenCalledWith({
        channel: 'C12345678',
        text: 'Channel message',
        blocks: undefined,
      })
    })

    it('returns error on API failure', async () => {
      mockChatPostMessage.mockRejectedValue(new Error('not_in_channel'))

      const result = await client.sendChannelMessage('C_PRIVATE', { text: 'Hello!' })

      expect(result.ok).toBe(false)
      expect(result.error).toBe('not_in_channel')
    })
  })

  describe('updateMessage', () => {
    it('updates message successfully', async () => {
      mockChatUpdate.mockResolvedValue({
        ok: true,
        channel: 'C12345678',
        ts: '1234567890.123456',
      })

      const result = await client.updateMessage('C12345678', '1234567890.123456', {
        text: 'Updated message',
      })

      expect(result.ok).toBe(true)
      expect(mockChatUpdate).toHaveBeenCalledWith({
        channel: 'C12345678',
        ts: '1234567890.123456',
        text: 'Updated message',
        blocks: undefined,
      })
    })

    it('returns error when message not found', async () => {
      mockChatUpdate.mockRejectedValue(new Error('message_not_found'))

      const result = await client.updateMessage('C12345678', 'invalid-ts', {
        text: 'Updated',
      })

      expect(result.ok).toBe(false)
      expect(result.error).toBe('message_not_found')
    })

    it('returns ok false when API returns ok: false', async () => {
      mockChatUpdate.mockResolvedValue({
        ok: false,
      })

      const result = await client.updateMessage('C12345678', '1234567890.123456', {
        text: 'Updated',
      })

      expect(result.ok).toBe(false)
    })
  })

  describe('getUserInfo', () => {
    it('returns user info when user exists', async () => {
      mockUsersInfo.mockResolvedValue({
        ok: true,
        user: {
          id: 'U12345678',
          name: 'testuser',
          real_name: 'Test User',
          profile: {
            email: 'test@example.com',
          },
          tz: 'America/New_York',
        },
      })

      const result = await client.getUserInfo('U12345678')

      expect(result).toEqual({
        id: 'U12345678',
        name: 'testuser',
        realName: 'Test User',
        email: 'test@example.com',
        timezone: 'America/New_York',
      })
      expect(mockUsersInfo).toHaveBeenCalledWith({ user: 'U12345678' })
    })

    it('returns null when API returns ok: false', async () => {
      mockUsersInfo.mockResolvedValue({
        ok: false,
      })

      const result = await client.getUserInfo('U_INVALID')

      expect(result).toBeNull()
    })

    it('returns null when user is not in response', async () => {
      mockUsersInfo.mockResolvedValue({
        ok: true,
        user: null,
      })

      const result = await client.getUserInfo('U12345678')

      expect(result).toBeNull()
    })

    it('returns null when API throws exception', async () => {
      mockUsersInfo.mockRejectedValue(new Error('user_not_found'))

      const result = await client.getUserInfo('U_NONEXISTENT')

      expect(result).toBeNull()
    })

    it('omits optional fields when not present in response', async () => {
      mockUsersInfo.mockResolvedValue({
        ok: true,
        user: {
          id: 'U12345678',
          name: 'minimaluser',
          // No real_name, profile.email, or tz
        },
      })

      const result = await client.getUserInfo('U12345678')

      expect(result).toEqual({
        id: 'U12345678',
        name: 'minimaluser',
        // Optional fields should not be present
      })
      expect(result?.realName).toBeUndefined()
      expect(result?.email).toBeUndefined()
      expect(result?.timezone).toBeUndefined()
    })

    it('uses userId as fallback for id if user.id is undefined', async () => {
      mockUsersInfo.mockResolvedValue({
        ok: true,
        user: {
          // id is undefined
          name: 'testuser',
        },
      })

      const result = await client.getUserInfo('U12345678')

      expect(result?.id).toBe('U12345678')
    })

    it('uses empty string as fallback for name if user.name is undefined', async () => {
      mockUsersInfo.mockResolvedValue({
        ok: true,
        user: {
          id: 'U12345678',
          // name is undefined
        },
      })

      const result = await client.getUserInfo('U12345678')

      expect(result?.name).toBe('')
    })
  })

  describe('verifySignature', () => {
    it('returns true for valid signature with current timestamp', () => {
      const timestamp = createValidTimestamp()
      const body = '{"type":"event_callback"}'
      const signature = generateSlackSignature(signingSecret, timestamp, body)

      const result = client.verifySignature(signature, timestamp, body)

      expect(result).toBe(true)
    })

    it('returns false for invalid signature', () => {
      const timestamp = createValidTimestamp()
      const body = '{"type":"event_callback"}'
      // Invalid signature must have the same length as a valid one (v0= + 64 hex chars)
      // because timingSafeEqual requires equal length buffers
      const invalidSignature = 'v0=' + '0'.repeat(64)

      const result = client.verifySignature(invalidSignature, timestamp, body)

      expect(result).toBe(false)
    })

    it('returns false for expired timestamp (older than 5 minutes)', () => {
      const expiredTimestamp = createExpiredTimestamp()
      const body = '{"type":"event_callback"}'
      const signature = generateSlackSignature(signingSecret, expiredTimestamp, body)

      const result = client.verifySignature(signature, expiredTimestamp, body)

      expect(result).toBe(false)
    })

    it('returns false when body has been tampered with', () => {
      const timestamp = createValidTimestamp()
      const originalBody = '{"type":"event_callback"}'
      const signature = generateSlackSignature(signingSecret, timestamp, originalBody)
      const tamperedBody = '{"type":"malicious_event"}'

      const result = client.verifySignature(signature, timestamp, tamperedBody)

      expect(result).toBe(false)
    })

    it('returns false when timestamp has been modified', () => {
      const originalTimestamp = createValidTimestamp()
      const body = '{"type":"event_callback"}'
      const signature = generateSlackSignature(signingSecret, originalTimestamp, body)
      // Use a different but still valid timestamp
      const differentTimestamp = String(parseInt(originalTimestamp, 10) + 1)

      const result = client.verifySignature(signature, differentTimestamp, body)

      expect(result).toBe(false)
    })

    it('verifies empty body correctly', () => {
      const timestamp = createValidTimestamp()
      const body = ''
      const signature = generateSlackSignature(signingSecret, timestamp, body)

      const result = client.verifySignature(signature, timestamp, body)

      expect(result).toBe(true)
    })

    it('verifies complex JSON body correctly', () => {
      const timestamp = createValidTimestamp()
      const body = JSON.stringify({
        type: 'event_callback',
        event: {
          type: 'message',
          text: 'Hello world',
          user: 'U12345678',
        },
      })
      const signature = generateSlackSignature(signingSecret, timestamp, body)

      const result = client.verifySignature(signature, timestamp, body)

      expect(result).toBe(true)
    })
  })

  describe('publishAppHome', () => {
    it('publishes view with correct user_id and view structure', async () => {
      mockViewsPublish.mockResolvedValue({ ok: true })

      const view = {
        type: 'home' as const,
        blocks: [{ type: 'header' as const, text: { type: 'plain_text' as const, text: 'Test' } }],
      }

      const result = await client.publishAppHome('U12345678', view)

      expect(result.ok).toBe(true)
      expect(mockViewsPublish).toHaveBeenCalledWith({
        user_id: 'U12345678',
        view: {
          type: 'home',
          blocks: view.blocks,
        },
      })
    })

    it('returns error when views.publish API throws', async () => {
      mockViewsPublish.mockRejectedValue(new Error('invalid_auth'))

      const view = {
        type: 'home' as const,
        blocks: [],
      }

      const result = await client.publishAppHome('U12345678', view)

      expect(result.ok).toBe(false)
      expect(result.error).toBe('invalid_auth')
    })
  })
})
