import type { Workspace } from '../types/index'

/**
 * Service for managing Slack workspace installations.
 * Handles the lifecycle of workspace records including OAuth registration,
 * token storage, and uninstallation cleanup.
 */
export interface WorkspaceService {
  /**
   * Look up a workspace by its Slack workspace ID
   */
  getById(workspaceId: string): Promise<Workspace | null>

  /**
   * Register a new workspace installation or update an existing one.
   * Uses an upsert pattern so re-authorizations update the bot token
   * instead of failing on duplicate workspace.
   */
  registerInstallation(params: {
    teamId: string
    teamName: string
    botToken: string
  }): Promise<Workspace>

  /**
   * Remove a workspace installation (called on app_uninstalled event).
   * Deletes the workspace record and its stored bot token.
   */
  removeInstallation(workspaceId: string): Promise<void>
}
