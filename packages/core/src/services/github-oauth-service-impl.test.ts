import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GitHubOAuthServiceImpl } from './github-oauth-service-impl'

describe('GitHubOAuthServiceImpl', () => {
  const clientId = 'test-github-client-id'
  const clientSecret = 'test-github-client-secret'
  let service: GitHubOAuthServiceImpl

  beforeEach(() => {
    service = new GitHubOAuthServiceImpl(clientId, clientSecret)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('exchangeCodeForToken', () => {
    it('returns access token on successful exchange', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          access_token: 'ghu_test_token_123',
          token_type: 'bearer',
        })),
      )

      const result = await service.exchangeCodeForToken('auth-code-123')

      expect(result.ok).toBe(true)
      expect(result.accessToken).toBe('ghu_test_token_123')
    })

    it('sends correct parameters in the exchange request', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          access_token: 'ghu_token',
          token_type: 'bearer',
        })),
      )

      await service.exchangeCodeForToken('the-code')

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://github.com/login/oauth/access_token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Accept: 'application/json' }),
        }),
      )

      const sentBody = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))
      expect(sentBody.client_id).toBe(clientId)
      expect(sentBody.client_secret).toBe(clientSecret)
      expect(sentBody.code).toBe('the-code')
    })

    it('returns error when GitHub responds with error body', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          error: 'bad_verification_code',
          error_description: 'The code passed is incorrect or expired.',
        })),
      )

      const result = await service.exchangeCodeForToken('expired-code')

      expect(result.ok).toBe(false)
      expect(result.error).toBe('bad_verification_code')
    })

    it('returns error when response does not match expected schema', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ unexpected: 'format' })),
      )

      const result = await service.exchangeCodeForToken('code')

      expect(result.ok).toBe(false)
      expect(result.error).toBe('invalid_response')
    })

    it('returns error when fetch throws network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network timeout'))

      const result = await service.exchangeCodeForToken('code')

      expect(result.ok).toBe(false)
      expect(result.error).toBe('Network timeout')
    })
  })

  describe('getAuthenticatedUser', () => {
    it('returns authenticated user identity on success', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          login: 'archulan',
          id: 12345,
          avatar_url: 'https://avatars.githubusercontent.com/u/12345',
          name: 'Archulan',
          type: 'User',
        })),
      )

      const user = await service.getAuthenticatedUser('ghu_test_token')

      expect(user).toEqual({
        login: 'archulan',
        id: 12345,
        avatarUrl: 'https://avatars.githubusercontent.com/u/12345',
      })
    })

    it('sends correct authorization header', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          login: 'user',
          id: 1,
          avatar_url: 'https://example.com/avatar',
        })),
      )

      await service.getAuthenticatedUser('ghu_my_token')

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.github.com/user',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer ghu_my_token',
          }),
        }),
      )
    })

    it('returns null when API returns non-OK status', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Unauthorized', { status: 401 }),
      )

      const user = await service.getAuthenticatedUser('invalid-token')

      expect(user).toBeNull()
    })

    it('returns null when response does not match schema', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ unexpected: 'format' })),
      )

      const user = await service.getAuthenticatedUser('token')

      expect(user).toBeNull()
    })

    it('returns null when fetch throws', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

      const user = await service.getAuthenticatedUser('token')

      expect(user).toBeNull()
    })
  })
})
