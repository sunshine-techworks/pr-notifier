import type { Workspace } from '../types/index'

/**
 * Data access interface for workspace operations
 */
export interface WorkspaceDao {
  // Generic CRUD
  create(workspace: Workspace): Promise<Workspace>
  findById(workspaceId: string): Promise<Workspace | null>
  update(workspaceId: string, data: Partial<Workspace>): Promise<Workspace>
  delete(workspaceId: string): Promise<void>
}
