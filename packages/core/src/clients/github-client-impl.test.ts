import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GitHubClientImpl } from './github-client-impl'

describe('GitHubClientImpl', () => {
  beforeEach(() => {
    // Prevent actual network requests during tests
    nock.disableNetConnect()
  })

  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
  })

  describe('validateUser', () => {
    it('returns user data when username exists', async () => {
      nock('https://api.github.com')
        .get('/users/octocat')
        .reply(200, {
          login: 'octocat',
          id: 583231,
          avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
          name: 'The Octocat',
          type: 'User',
        })

      const client = new GitHubClientImpl()
      const result = await client.validateUser('octocat')

      expect(result).toEqual({
        valid: true,
        user: {
          login: 'octocat',
          id: 583231,
          avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
          name: 'The Octocat',
          type: 'User',
        },
      })
    })

    it('returns not_found when username does not exist (404)', async () => {
      nock('https://api.github.com')
        .get('/users/nonexistent-user-xyz-12345')
        .reply(404, {
          message: 'Not Found',
          documentation_url: 'https://docs.github.com/rest/users/users#get-a-user',
          status: '404',
        })

      const client = new GitHubClientImpl()
      const result = await client.validateUser('nonexistent-user-xyz-12345')

      expect(result).toEqual({
        valid: false,
        reason: 'not_found',
        message: "GitHub user 'nonexistent-user-xyz-12345' not found",
      })
    })

    it('returns rate_limited when API rate limit exceeded (403 with x-ratelimit-remaining=0)', async () => {
      const resetTimestamp = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now

      nock('https://api.github.com')
        .get('/users/octocat')
        .reply(403, { message: 'API rate limit exceeded' }, {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(resetTimestamp),
        })

      const client = new GitHubClientImpl()
      const result = await client.validateUser('octocat')

      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.reason).toBe('rate_limited')
        expect(result.message).toContain('GitHub API rate limit exceeded')
        expect(result.message).toContain('Resets at')
      }
    })

    it('returns api_error for other HTTP errors (500)', async () => {
      nock('https://api.github.com')
        .get('/users/octocat')
        .reply(500, { message: 'Internal Server Error' })

      const client = new GitHubClientImpl()
      const result = await client.validateUser('octocat')

      expect(result).toEqual({
        valid: false,
        reason: 'api_error',
        message: 'GitHub API error: 500 Internal Server Error',
      })
    })

    it('returns api_error when fetch throws network error', async () => {
      nock('https://api.github.com')
        .get('/users/octocat')
        .replyWithError('Network connection failed')

      const client = new GitHubClientImpl()
      const result = await client.validateUser('octocat')

      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.reason).toBe('api_error')
        expect(result.message).toContain('Failed to connect to GitHub API')
      }
    })

    it('includes Authorization header when token provided', async () => {
      const scope = nock('https://api.github.com')
        .matchHeader('Authorization', 'Bearer ghp_test_token_123')
        .get('/users/octocat')
        .reply(200, {
          login: 'octocat',
          id: 583231,
          avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
          name: 'The Octocat',
          type: 'User',
        })

      const client = new GitHubClientImpl('ghp_test_token_123')
      await client.validateUser('octocat')

      // nock will throw if the header doesn't match, so we verify the scope completed
      expect(scope.isDone()).toBe(true)
    })

    it('excludes Authorization header when no token provided', async () => {
      // badheaders option causes nock to fail if the header IS present
      const scope = nock('https://api.github.com', {
        badheaders: ['Authorization'],
      })
        .get('/users/octocat')
        .reply(200, {
          login: 'octocat',
          id: 583231,
          avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
          name: 'The Octocat',
          type: 'User',
        })

      const client = new GitHubClientImpl()
      await client.validateUser('octocat')

      expect(scope.isDone()).toBe(true)
    })

    it('encodes special characters in username', async () => {
      // nock automatically handles URL encoding, so we match the encoded path
      nock('https://api.github.com')
        .get('/users/user%2Fwith%2Fslashes')
        .reply(404, { message: 'Not Found' })

      const client = new GitHubClientImpl()
      const result = await client.validateUser('user/with/slashes')

      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.reason).toBe('not_found')
      }
    })

    it('returns api_error when response does not match Zod schema', async () => {
      // Response missing required fields (id, avatar_url, name, type)
      nock('https://api.github.com')
        .get('/users/octocat')
        .reply(200, {
          login: 'octocat',
          // Missing: id, avatar_url, name, type
        })

      const client = new GitHubClientImpl()
      const result = await client.validateUser('octocat')

      expect(result).toEqual({
        valid: false,
        reason: 'api_error',
        message: 'Unexpected response format from GitHub API',
      })
    })

    it('correctly parses user with null name', async () => {
      // GitHub allows users to have no display name set
      nock('https://api.github.com')
        .get('/users/anonymous-dev')
        .reply(200, {
          login: 'anonymous-dev',
          id: 789012,
          avatar_url: 'https://avatars.githubusercontent.com/u/789012?v=4',
          name: null,
          type: 'User',
        })

      const client = new GitHubClientImpl()
      const result = await client.validateUser('anonymous-dev')

      expect(result).toEqual({
        valid: true,
        user: {
          login: 'anonymous-dev',
          id: 789012,
          avatarUrl: 'https://avatars.githubusercontent.com/u/789012?v=4',
          name: null,
          type: 'User',
        },
      })
    })
  })
})
