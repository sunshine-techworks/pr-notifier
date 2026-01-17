import type { User } from '../types/index'

/**
 * Data access interface for user operations
 */
export interface UserDao {
  // Generic CRUD
  create(user: User): Promise<User>
  findById(slackUserId: string): Promise<User | null>
  update(slackUserId: string, data: Partial<User>): Promise<User>
  delete(slackUserId: string): Promise<void>

  // Specific finders (different DB indexes/access patterns)
  findByGithubUsername(githubUsername: string): Promise<User | null>
  findByWorkspaceId(workspaceId: string): Promise<User[]>
  countByWorkspaceId(workspaceId: string): Promise<number>
}
