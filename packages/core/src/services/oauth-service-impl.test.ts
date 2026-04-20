import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OAuthServiceImpl } from './oauth-service-impl'

describe('OAuthServiceImpl', () => {
  const clientId = 'test-client-id'
  const clientSecret = 'test-client-secret'
  const redirectUri = 'https://example.com/slack/oauth/callback'
  let service: OAuthServiceImpl

  beforeEach(() => {
    service = new OAuthServiceImpl(clientId, clientSecret, redirectUri)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getAuthorizationUrl', () => {
    it('constructs URL with client_id, scope, and redirect_uri', () => {
      const url = service.getAuthorizationUrl()

      expect(url).toContain('https://slack.com/oauth/v2/authorize')
      expect(url).toContain('client_id=test-client-id')
      expect(url).toContain('scope=chat%3Awrite%2Ccommands%2Cusers%3Aread')
      expect(url).toContain(`redirect_uri=${encodeURIComponent(redirectUri)}`)
    })
  })

  describe('exchangeCodeForToken', () => {
    it('returns access token and team info on successful exchange', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          ok: true,
          access_token: 'xoxb-new-workspace-token',
          team: { id: 'T_NEW', name: 'New Startup' },
        })),
      )

      const result = await service.exchangeCodeForToken('temp-auth-code')

      expect(result.ok).toBe(true)
      expect(result.accessToken).toBe('xoxb-new-workspace-token')
      expect(result.teamId).toBe('T_NEW')
      expect(result.teamName).toBe('New Startup')
    })

    it('sends correct parameters in the token exchange request', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          ok: true,
          access_token: 'xoxb-token',
          team: { id: 'T1', name: 'Team' },
        })),
      )

      await service.exchangeCodeForToken('the-code')

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://slack.com/api/oauth.v2.access',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('code=the-code'),
        }),
      )

      const sentBody = fetchSpy.mock.calls[0][1]?.body
      expect(String(sentBody)).toContain(`client_id=${clientId}`)
      expect(String(sentBody)).toContain(`client_secret=${clientSecret}`)
    })

    it('returns error when Slack API responds with ok: false', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          ok: false,
          error: 'invalid_code',
        })),
      )

      const result = await service.exchangeCodeForToken('expired-code')

      expect(result.ok).toBe(false)
      expect(result.error).toBe('invalid_code')
    })

    it('returns error when response is missing token or team', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          ok: true,
          access_token: '',
          team: { id: '', name: '' },
        })),
      )

      const result = await service.exchangeCodeForToken('code')

      expect(result.ok).toBe(false)
      expect(result.error).toBe('missing_token_or_team')
    })

    it('returns error when fetch throws network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network timeout'))

      const result = await service.exchangeCodeForToken('code')

      expect(result.ok).toBe(false)
      expect(result.error).toBe('Network timeout')
    })
  })
})
