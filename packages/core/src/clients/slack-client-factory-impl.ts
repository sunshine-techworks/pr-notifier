import type { SlackClient } from '../interfaces/slack-client'
import type { SlackClientFactory } from '../interfaces/slack-client-factory'
import type { WorkspaceService } from '../interfaces/workspace-service'

import { SlackClientImpl } from './slack-client-impl'

/**
 * Creates and caches workspace-specific SlackClient instances.
 *
 * Looks up the bot token from the WorkspaceService and creates a
 * SlackClientImpl configured for that workspace. Caches clients in
 * a Map so warm Lambda containers reuse existing WebClient instances
 * instead of creating new ones on every invocation.
 *
 * Supports a fallback token for backward compatibility during the
 * migration from single hardcoded token to per-workspace tokens.
 */
export class SlackClientFactoryImpl implements SlackClientFactory {
  private readonly clientCache = new Map<string, SlackClient>()

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly signingSecret: string,
    private readonly fallbackToken?: string,
  ) {}

  async getClientForWorkspace(workspaceId: string): Promise<SlackClient> {
    // Return cached client if available
    const cached = this.clientCache.get(workspaceId)
    if (cached) {
      return cached
    }

    // Look up workspace to get the bot token
    const workspace = await this.workspaceService.getById(workspaceId)
    const token = workspace?.slackBotToken ?? this.fallbackToken

    if (!token) {
      throw new Error(
        `No bot token found for workspace ${workspaceId}. `
          + 'The workspace may not have completed OAuth installation.',
      )
    }

    // Create and cache a new client for this workspace
    const client = new SlackClientImpl(token, this.signingSecret)
    this.clientCache.set(workspaceId, client)
    return client
  }
}
