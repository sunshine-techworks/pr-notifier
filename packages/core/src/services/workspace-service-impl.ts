import type { WorkspaceDao } from '../interfaces/workspace-dao'
import type { WorkspaceService } from '../interfaces/workspace-service'
import type { Workspace } from '../types/index'

/**
 * Service implementation for managing Slack workspace installations.
 * Wraps WorkspaceDao with business logic for OAuth registration and cleanup.
 */
export class WorkspaceServiceImpl implements WorkspaceService {
  constructor(
    private readonly workspaceDao: WorkspaceDao,
  ) {}

  async getById(workspaceId: string): Promise<Workspace | null> {
    return this.workspaceDao.findById(workspaceId)
  }

  /**
   * Registers a new workspace installation or updates an existing one.
   * Tries to create first; if the workspace already exists (re-authorization),
   * falls through to update with the new bot token.
   */
  async registerInstallation(params: {
    teamId: string
    teamName: string
    botToken: string
  }): Promise<Workspace> {
    const workspace: Workspace = {
      slackWorkspaceId: params.teamId,
      name: params.teamName,
      tier: 'free',
      slackBotToken: params.botToken,
      userCount: 0,
      installedAt: new Date().toISOString(),
    }

    try {
      return await this.workspaceDao.create(workspace)
    } catch (error) {
      // If workspace already exists (re-authorization), update the token instead
      const isConditionalCheckFailed = error instanceof Error
        && 'name' in error
        && error.name === 'ConditionalCheckFailedException'

      if (isConditionalCheckFailed) {
        return await this.workspaceDao.update(params.teamId, {
          name: params.teamName,
          slackBotToken: params.botToken,
        })
      }

      throw error
    }
  }

  async removeInstallation(workspaceId: string): Promise<void> {
    await this.workspaceDao.delete(workspaceId)
  }
}
