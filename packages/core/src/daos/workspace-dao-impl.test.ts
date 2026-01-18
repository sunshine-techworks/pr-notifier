import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMockDynamoDBDocumentClient, createTestWorkspace } from '../testing/index'
import type { MockDynamoDBDocumentClient } from '../testing/index'

import { WorkspaceDaoImpl } from './workspace-dao-impl'

describe('WorkspaceDaoImpl', () => {
  const tableName = 'pr-notify-test-table'
  let mockDocClient: MockDynamoDBDocumentClient
  let dao: WorkspaceDaoImpl

  beforeEach(() => {
    vi.clearAllMocks()
    mockDocClient = createMockDynamoDBDocumentClient()
    dao = new WorkspaceDaoImpl(mockDocClient, tableName)
  })

  describe('create', () => {
    it('sends PutCommand with correct key format', async () => {
      mockDocClient.send.mockResolvedValue({})

      const workspace = createTestWorkspace({
        slackWorkspaceId: 'W_WORKSPACE_123',
      })

      await dao.create(workspace)

      expect(mockDocClient.send).toHaveBeenCalledTimes(1)

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      expect(sentCommand).toBeInstanceOf(PutCommand)

      const input = sentCommand.input
      expect(input.TableName).toBe(tableName)
      expect(input.Item.PK).toBe('WORKSPACE#W_WORKSPACE_123')
      expect(input.Item.SK).toBe('WORKSPACE#W_WORKSPACE_123')
    })

    it('includes condition expression to prevent overwriting existing workspace', async () => {
      mockDocClient.send.mockResolvedValue({})

      const workspace = createTestWorkspace()

      await dao.create(workspace)

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      expect(sentCommand.input.ConditionExpression).toBe('attribute_not_exists(PK)')
    })

    it('includes all workspace fields in the item', async () => {
      mockDocClient.send.mockResolvedValue({})

      const workspace = createTestWorkspace({
        slackWorkspaceId: 'W_TEST',
        name: 'Test Workspace',
        tier: 'pro',
        userCount: 50,
        billingEmail: 'billing@test.com',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_456',
      })

      await dao.create(workspace)

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      const item = sentCommand.input.Item

      expect(item.slackWorkspaceId).toBe('W_TEST')
      expect(item.name).toBe('Test Workspace')
      expect(item.tier).toBe('pro')
      expect(item.userCount).toBe(50)
      expect(item.billingEmail).toBe('billing@test.com')
      expect(item.stripeCustomerId).toBe('cus_123')
      expect(item.stripeSubscriptionId).toBe('sub_456')
    })

    it('returns the created workspace', async () => {
      mockDocClient.send.mockResolvedValue({})

      const workspace = createTestWorkspace({
        slackWorkspaceId: 'W_CREATED',
        name: 'Created Workspace',
      })

      const result = await dao.create(workspace)

      expect(result).toEqual(workspace)
    })
  })

  describe('findById', () => {
    it('sends GetCommand with correct key format', async () => {
      mockDocClient.send.mockResolvedValue({ Item: undefined })

      await dao.findById('W_WORKSPACE_123')

      expect(mockDocClient.send).toHaveBeenCalledTimes(1)

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      expect(sentCommand).toBeInstanceOf(GetCommand)

      const input = sentCommand.input
      expect(input.TableName).toBe(tableName)
      expect(input.Key).toEqual({
        PK: 'WORKSPACE#W_WORKSPACE_123',
        SK: 'WORKSPACE#W_WORKSPACE_123',
      })
    })

    it('returns parsed workspace when item exists', async () => {
      const workspaceData = createTestWorkspace({
        slackWorkspaceId: 'W_FOUND',
        name: 'Found Workspace',
        tier: 'enterprise',
      })

      mockDocClient.send.mockResolvedValue({
        Item: {
          PK: 'WORKSPACE#W_FOUND',
          SK: 'WORKSPACE#W_FOUND',
          ...workspaceData,
        },
      })

      const result = await dao.findById('W_FOUND')

      expect(result).toEqual(workspaceData)
    })

    it('returns null when item does not exist', async () => {
      mockDocClient.send.mockResolvedValue({ Item: undefined })

      const result = await dao.findById('W_NONEXISTENT')

      expect(result).toBeNull()
    })

    it('validates response with Zod schema', async () => {
      // Missing required field 'name' - should throw Zod validation error
      mockDocClient.send.mockResolvedValue({
        Item: {
          PK: 'WORKSPACE#W_INVALID',
          SK: 'WORKSPACE#W_INVALID',
          slackWorkspaceId: 'W_INVALID',
          // Missing: name, tier, userCount, installedAt
        },
      })

      await expect(dao.findById('W_INVALID')).rejects.toThrow()
    })
  })

  describe('update', () => {
    it('sends UpdateCommand with correct key format', async () => {
      const updatedWorkspace = createTestWorkspace({
        slackWorkspaceId: 'W_UPDATE',
        name: 'Updated Name',
      })

      mockDocClient.send.mockResolvedValue({
        Attributes: {
          PK: 'WORKSPACE#W_UPDATE',
          SK: 'WORKSPACE#W_UPDATE',
          ...updatedWorkspace,
        },
      })

      await dao.update('W_UPDATE', { name: 'Updated Name' })

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      expect(sentCommand).toBeInstanceOf(UpdateCommand)

      const input = sentCommand.input
      expect(input.TableName).toBe(tableName)
      expect(input.Key).toEqual({
        PK: 'WORKSPACE#W_UPDATE',
        SK: 'WORKSPACE#W_UPDATE',
      })
    })

    it('builds dynamic update expression from provided data', async () => {
      const updatedWorkspace = createTestWorkspace({
        slackWorkspaceId: 'W_UPDATE',
        name: 'New Name',
        tier: 'pro',
      })

      mockDocClient.send.mockResolvedValue({
        Attributes: {
          ...updatedWorkspace,
        },
      })

      await dao.update('W_UPDATE', { name: 'New Name', tier: 'pro' })

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      const input = sentCommand.input

      // Should have SET expression with both fields
      expect(input.UpdateExpression).toContain('SET')
      expect(input.UpdateExpression).toContain('#name = :name')
      expect(input.UpdateExpression).toContain('#tier = :tier')

      // Check expression attribute names
      expect(input.ExpressionAttributeNames).toEqual({
        '#name': 'name',
        '#tier': 'tier',
      })

      // Check expression attribute values
      expect(input.ExpressionAttributeValues).toEqual({
        ':name': 'New Name',
        ':tier': 'pro',
      })
    })

    it('excludes slackWorkspaceId from update expression', async () => {
      const updatedWorkspace = createTestWorkspace()

      mockDocClient.send.mockResolvedValue({
        Attributes: { ...updatedWorkspace },
      })

      // Attempting to update slackWorkspaceId should be ignored
      await dao.update('W_UPDATE', {
        slackWorkspaceId: 'W_DIFFERENT',
        name: 'New Name',
      })

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      const input = sentCommand.input

      // Should not include slackWorkspaceId in update
      expect(input.ExpressionAttributeNames).not.toHaveProperty('#slackWorkspaceId')
      expect(input.ExpressionAttributeValues).not.toHaveProperty(':slackWorkspaceId')
    })

    it('requests ALL_NEW return values', async () => {
      const updatedWorkspace = createTestWorkspace()

      mockDocClient.send.mockResolvedValue({
        Attributes: { ...updatedWorkspace },
      })

      await dao.update('W_UPDATE', { name: 'New Name' })

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      expect(sentCommand.input.ReturnValues).toBe('ALL_NEW')
    })

    it('returns the updated workspace', async () => {
      const updatedWorkspace = createTestWorkspace({
        slackWorkspaceId: 'W_UPDATE',
        name: 'Updated Name',
        userCount: 100,
      })

      mockDocClient.send.mockResolvedValue({
        Attributes: {
          PK: 'WORKSPACE#W_UPDATE',
          SK: 'WORKSPACE#W_UPDATE',
          ...updatedWorkspace,
        },
      })

      const result = await dao.update('W_UPDATE', { name: 'Updated Name', userCount: 100 })

      expect(result).toEqual(updatedWorkspace)
    })

    it('ignores undefined values in update data', async () => {
      const updatedWorkspace = createTestWorkspace()

      mockDocClient.send.mockResolvedValue({
        Attributes: { ...updatedWorkspace },
      })

      await dao.update('W_UPDATE', {
        name: 'New Name',
        billingEmail: undefined,
      })

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      const input = sentCommand.input

      // Should only include name, not billingEmail
      expect(input.ExpressionAttributeNames).toEqual({ '#name': 'name' })
      expect(input.ExpressionAttributeValues).toEqual({ ':name': 'New Name' })
    })
  })

  describe('delete', () => {
    it('sends DeleteCommand with correct key format', async () => {
      mockDocClient.send.mockResolvedValue({})

      await dao.delete('W_DELETE_123')

      expect(mockDocClient.send).toHaveBeenCalledTimes(1)

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      expect(sentCommand).toBeInstanceOf(DeleteCommand)

      const input = sentCommand.input
      expect(input.TableName).toBe(tableName)
      expect(input.Key).toEqual({
        PK: 'WORKSPACE#W_DELETE_123',
        SK: 'WORKSPACE#W_DELETE_123',
      })
    })

    it('does not throw when workspace does not exist', async () => {
      // DynamoDB delete is idempotent - doesn't throw if item doesn't exist
      mockDocClient.send.mockResolvedValue({})

      await expect(dao.delete('W_NONEXISTENT')).resolves.toBeUndefined()
    })
  })
})