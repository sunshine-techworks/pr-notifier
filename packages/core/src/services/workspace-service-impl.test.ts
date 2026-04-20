import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkspaceDao } from '../interfaces/workspace-dao'
import {
  createMockWorkspaceDao,
  createTestWorkspace,
} from '../testing/index'

import { WorkspaceServiceImpl } from './workspace-service-impl'

describe('WorkspaceServiceImpl', () => {
  let mockWorkspaceDao: WorkspaceDao
  let service: WorkspaceServiceImpl

  beforeEach(() => {
    vi.clearAllMocks()
    mockWorkspaceDao = createMockWorkspaceDao()
    service = new WorkspaceServiceImpl(mockWorkspaceDao)
  })

  describe('getById', () => {
    it('returns workspace when found', async () => {
      const workspace = createTestWorkspace()
      vi.mocked(mockWorkspaceDao.findById).mockResolvedValue(workspace)

      const result = await service.getById('W12345678')

      expect(result).toEqual(workspace)
      expect(mockWorkspaceDao.findById).toHaveBeenCalledWith('W12345678')
    })

    it('returns null when workspace not found', async () => {
      vi.mocked(mockWorkspaceDao.findById).mockResolvedValue(null)

      const result = await service.getById('W_UNKNOWN')

      expect(result).toBeNull()
    })
  })

  describe('registerInstallation', () => {
    it('creates a new workspace on first installation', async () => {
      const expectedWorkspace = createTestWorkspace({
        slackWorkspaceId: 'W_NEW',
        name: 'New Startup',
        slackBotToken: 'xoxb-new-token',
      })
      vi.mocked(mockWorkspaceDao.create).mockResolvedValue(expectedWorkspace)

      const result = await service.registerInstallation({
        teamId: 'W_NEW',
        teamName: 'New Startup',
        botToken: 'xoxb-new-token',
      })

      expect(result.slackWorkspaceId).toBe('W_NEW')
      expect(result.slackBotToken).toBe('xoxb-new-token')
      expect(mockWorkspaceDao.create).toHaveBeenCalledOnce()
    })

    it('sets default tier to free for new installations', async () => {
      vi.mocked(mockWorkspaceDao.create).mockImplementation(async (w) => w)

      await service.registerInstallation({
        teamId: 'W_NEW',
        teamName: 'New Startup',
        botToken: 'xoxb-token',
      })

      const createdWorkspace = vi.mocked(mockWorkspaceDao.create).mock.calls[0][0]
      expect(createdWorkspace.tier).toBe('free')
    })

    it('updates existing workspace on re-authorization', async () => {
      // Simulate ConditionalCheckFailedException from DynamoDB
      const conditionalError = new Error('The conditional request failed')
      conditionalError.name = 'ConditionalCheckFailedException'
      vi.mocked(mockWorkspaceDao.create).mockRejectedValue(conditionalError)

      const updatedWorkspace = createTestWorkspace({
        slackWorkspaceId: 'W_EXISTING',
        name: 'Updated Name',
        slackBotToken: 'xoxb-refreshed-token',
      })
      vi.mocked(mockWorkspaceDao.update).mockResolvedValue(updatedWorkspace)

      const result = await service.registerInstallation({
        teamId: 'W_EXISTING',
        teamName: 'Updated Name',
        botToken: 'xoxb-refreshed-token',
      })

      expect(result.slackBotToken).toBe('xoxb-refreshed-token')
      expect(mockWorkspaceDao.update).toHaveBeenCalledWith('W_EXISTING', {
        name: 'Updated Name',
        slackBotToken: 'xoxb-refreshed-token',
      })
    })

    it('propagates unexpected errors from create', async () => {
      const unexpectedError = new Error('DynamoDB connection failed')
      unexpectedError.name = 'InternalServerError'
      vi.mocked(mockWorkspaceDao.create).mockRejectedValue(unexpectedError)

      await expect(
        service.registerInstallation({
          teamId: 'W_NEW',
          teamName: 'Startup',
          botToken: 'xoxb-token',
        }),
      ).rejects.toThrow('DynamoDB connection failed')
    })
  })

  describe('removeInstallation', () => {
    it('deletes the workspace record', async () => {
      vi.mocked(mockWorkspaceDao.delete).mockResolvedValue()

      await service.removeInstallation('W_REMOVED')

      expect(mockWorkspaceDao.delete).toHaveBeenCalledWith('W_REMOVED')
    })
  })
})
