import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkspaceService } from '../interfaces/workspace-service'
import { createMockWorkspaceService, createTestWorkspace } from '../testing/index'

import { SlackClientFactoryImpl } from './slack-client-factory-impl'

// Mock @slack/web-api to prevent real HTTP calls from SlackClientImpl
vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chat: { postMessage: vi.fn(), update: vi.fn() },
    users: { info: vi.fn() },
    views: { publish: vi.fn() },
  })),
}))

describe('SlackClientFactoryImpl', () => {
  let mockWorkspaceService: WorkspaceService
  const signingSecret = 'test-signing-secret'

  beforeEach(() => {
    vi.clearAllMocks()
    mockWorkspaceService = createMockWorkspaceService()
  })

  it('returns a SlackClient using the workspace bot token', async () => {
    const workspace = createTestWorkspace({ slackBotToken: 'xoxb-workspace-token' })
    vi.mocked(mockWorkspaceService.getById).mockResolvedValue(workspace)

    const factory = new SlackClientFactoryImpl(mockWorkspaceService, signingSecret)
    const client = await factory.getClientForWorkspace('W12345678')

    expect(client).toBeDefined()
    expect(mockWorkspaceService.getById).toHaveBeenCalledWith('W12345678')
  })

  it('caches clients for the same workspace across calls', async () => {
    const workspace = createTestWorkspace({ slackBotToken: 'xoxb-cached-token' })
    vi.mocked(mockWorkspaceService.getById).mockResolvedValue(workspace)

    const factory = new SlackClientFactoryImpl(mockWorkspaceService, signingSecret)
    const client1 = await factory.getClientForWorkspace('W12345678')
    const client2 = await factory.getClientForWorkspace('W12345678')

    // Same instance returned from cache
    expect(client1).toBe(client2)
    // Only one DB lookup despite two calls
    expect(mockWorkspaceService.getById).toHaveBeenCalledTimes(1)
  })

  it('creates separate clients for different workspaces', async () => {
    vi.mocked(mockWorkspaceService.getById)
      .mockResolvedValueOnce(createTestWorkspace({
        slackWorkspaceId: 'W_A',
        slackBotToken: 'xoxb-token-a',
      }))
      .mockResolvedValueOnce(createTestWorkspace({
        slackWorkspaceId: 'W_B',
        slackBotToken: 'xoxb-token-b',
      }))

    const factory = new SlackClientFactoryImpl(mockWorkspaceService, signingSecret)
    const clientA = await factory.getClientForWorkspace('W_A')
    const clientB = await factory.getClientForWorkspace('W_B')

    expect(clientA).not.toBe(clientB)
    expect(mockWorkspaceService.getById).toHaveBeenCalledTimes(2)
  })

  it('falls back to fallback token when workspace has no stored token', async () => {
    // Workspace exists but has no bot token (pre-OAuth migration)
    vi.mocked(mockWorkspaceService.getById).mockResolvedValue(
      createTestWorkspace({ slackBotToken: undefined }),
    )

    const factory = new SlackClientFactoryImpl(
      mockWorkspaceService,
      signingSecret,
      'xoxb-fallback-token',
    )
    const client = await factory.getClientForWorkspace('W_OLD')

    expect(client).toBeDefined()
  })

  it('falls back to fallback token when workspace not found', async () => {
    vi.mocked(mockWorkspaceService.getById).mockResolvedValue(null)

    const factory = new SlackClientFactoryImpl(
      mockWorkspaceService,
      signingSecret,
      'xoxb-fallback-token',
    )
    const client = await factory.getClientForWorkspace('W_UNKNOWN')

    expect(client).toBeDefined()
  })

  it('throws when no token found and no fallback configured', async () => {
    vi.mocked(mockWorkspaceService.getById).mockResolvedValue(null)

    const factory = new SlackClientFactoryImpl(mockWorkspaceService, signingSecret)

    await expect(factory.getClientForWorkspace('W_MISSING'))
      .rejects.toThrow('No bot token found for workspace W_MISSING')
  })

  it('throws when workspace has no token and no fallback configured', async () => {
    vi.mocked(mockWorkspaceService.getById).mockResolvedValue(
      createTestWorkspace({ slackBotToken: undefined }),
    )

    const factory = new SlackClientFactoryImpl(mockWorkspaceService, signingSecret)

    await expect(factory.getClientForWorkspace('W_NO_TOKEN'))
      .rejects.toThrow('No bot token found')
  })
})
