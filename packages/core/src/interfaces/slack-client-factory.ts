import type { SlackClient } from './slack-client'

/**
 * Factory for creating workspace-specific SlackClient instances.
 * Looks up the per-workspace bot token and returns a configured client.
 */
export interface SlackClientFactory {
  /**
   * Get a SlackClient configured with the bot token for the given workspace.
   * Implementations should cache clients for reuse within the same Lambda container.
   */
  getClientForWorkspace(workspaceId: string): Promise<SlackClient>
}
