import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMockDynamoDBDocumentClient, createTestUser } from '../testing/index'
import type { MockDynamoDBDocumentClient } from '../testing/index'

import { UserDaoImpl } from './user-dao-impl'

describe('UserDaoImpl', () => {
  const tableName = 'pr-notify-test-table'
  let mockDocClient: MockDynamoDBDocumentClient
  let dao: UserDaoImpl

  beforeEach(() => {
    vi.clearAllMocks()
    mockDocClient = createMockDynamoDBDocumentClient()
    dao = new UserDaoImpl(mockDocClient, tableName)
  })

  describe('create', () => {
    it('sends PutCommand with correct PK/SK format', async () => {
      mockDocClient.send.mockResolvedValue({})

      const user = createTestUser({
        slackUserId: 'U_USER_123',
      })

      await dao.create(user)

      expect(mockDocClient.send).toHaveBeenCalledTimes(1)

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      expect(sentCommand).toBeInstanceOf(PutCommand)

      const input = sentCommand.input
      expect(input.TableName).toBe(tableName)
      expect(input.Item.PK).toBe('SLACK_USER#U_USER_123')
      expect(input.Item.SK).toBe('SLACK_USER#U_USER_123')
    })

    it('creates GSI1 keys with lowercase GitHub username', async () => {
      mockDocClient.send.mockResolvedValue({})

      const user = createTestUser({
        githubUsername: 'OctoCat', // Mixed case
      })

      await dao.create(user)

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      const item = sentCommand.input.Item

      // GSI1 keys should be lowercase
      expect(item.GSI1PK).toBe('GITHUB#octocat')
      expect(item.GSI1SK).toBe('GITHUB#octocat')
    })

    it('includes condition expression to prevent overwriting existing user', async () => {
      mockDocClient.send.mockResolvedValue({})

      const user = createTestUser()

      await dao.create(user)

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      expect(sentCommand.input.ConditionExpression).toBe('attribute_not_exists(PK)')
    })

    it('includes all user fields in the item', async () => {
      mockDocClient.send.mockResolvedValue({})

      const user = createTestUser({
        slackUserId: 'U_TEST',
        slackWorkspaceId: 'W_WORKSPACE',
        githubUsername: 'testuser',
        digestEnabled: true,
        digestTime: '09:00',
        timezone: 'America/New_York',
      })

      await dao.create(user)

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      const item = sentCommand.input.Item

      expect(item.slackUserId).toBe('U_TEST')
      expect(item.slackWorkspaceId).toBe('W_WORKSPACE')
      expect(item.githubUsername).toBe('testuser')
      expect(item.digestEnabled).toBe(true)
      expect(item.digestTime).toBe('09:00')
      expect(item.timezone).toBe('America/New_York')
    })

    it('returns the created user', async () => {
      mockDocClient.send.mockResolvedValue({})

      const user = createTestUser({
        slackUserId: 'U_CREATED',
      })

      const result = await dao.create(user)

      expect(result).toEqual(user)
    })
  })

  describe('findById', () => {
    it('sends GetCommand with correct key format', async () => {
      mockDocClient.send.mockResolvedValue({ Item: undefined })

      await dao.findById('U_USER_123')

      expect(mockDocClient.send).toHaveBeenCalledTimes(1)

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      expect(sentCommand).toBeInstanceOf(GetCommand)

      const input = sentCommand.input
      expect(input.TableName).toBe(tableName)
      expect(input.Key).toEqual({
        PK: 'SLACK_USER#U_USER_123',
        SK: 'SLACK_USER#U_USER_123',
      })
    })

    it('returns parsed user when item exists', async () => {
      const userData = createTestUser({
        slackUserId: 'U_FOUND',
        githubUsername: 'founduser',
      })

      mockDocClient.send.mockResolvedValue({
        Item: {
          PK: 'SLACK_USER#U_FOUND',
          SK: 'SLACK_USER#U_FOUND',
          GSI1PK: 'GITHUB#founduser',
          GSI1SK: 'GITHUB#founduser',
          ...userData,
        },
      })

      const result = await dao.findById('U_FOUND')

      expect(result).toEqual(userData)
    })

    it('returns null when item does not exist', async () => {
      mockDocClient.send.mockResolvedValue({ Item: undefined })

      const result = await dao.findById('U_NONEXISTENT')

      expect(result).toBeNull()
    })

    it('validates response with Zod schema', async () => {
      // Missing required fields - should throw Zod validation error
      mockDocClient.send.mockResolvedValue({
        Item: {
          PK: 'SLACK_USER#U_INVALID',
          SK: 'SLACK_USER#U_INVALID',
          slackUserId: 'U_INVALID',
          // Missing: slackWorkspaceId, githubUsername, preferences, etc.
        },
      })

      await expect(dao.findById('U_INVALID')).rejects.toThrow()
    })
  })

  describe('update', () => {
    it('sends UpdateCommand with correct key format', async () => {
      const updatedUser = createTestUser({
        slackUserId: 'U_UPDATE',
      })

      mockDocClient.send.mockResolvedValue({
        Attributes: {
          PK: 'SLACK_USER#U_UPDATE',
          SK: 'SLACK_USER#U_UPDATE',
          ...updatedUser,
        },
      })

      await dao.update('U_UPDATE', { digestEnabled: true })

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      expect(sentCommand).toBeInstanceOf(UpdateCommand)

      const input = sentCommand.input
      expect(input.TableName).toBe(tableName)
      expect(input.Key).toEqual({
        PK: 'SLACK_USER#U_UPDATE',
        SK: 'SLACK_USER#U_UPDATE',
      })
    })

    it('builds dynamic update expression from provided data', async () => {
      const updatedUser = createTestUser()

      mockDocClient.send.mockResolvedValue({
        Attributes: { ...updatedUser },
      })

      await dao.update('U_UPDATE', { digestEnabled: true, timezone: 'UTC' })

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      const input = sentCommand.input

      expect(input.UpdateExpression).toContain('SET')
      expect(input.UpdateExpression).toContain('#digestEnabled = :digestEnabled')
      expect(input.UpdateExpression).toContain('#timezone = :timezone')

      expect(input.ExpressionAttributeNames).toMatchObject({
        '#digestEnabled': 'digestEnabled',
        '#timezone': 'timezone',
      })

      expect(input.ExpressionAttributeValues).toMatchObject({
        ':digestEnabled': true,
        ':timezone': 'UTC',
      })
    })

    it('updates GSI1 keys when githubUsername changes', async () => {
      const updatedUser = createTestUser({
        githubUsername: 'NewUsername',
      })

      mockDocClient.send.mockResolvedValue({
        Attributes: { ...updatedUser },
      })

      await dao.update('U_UPDATE', { githubUsername: 'NewUsername' })

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      const input = sentCommand.input

      // Should update GSI1 keys with lowercase username
      expect(input.UpdateExpression).toContain('GSI1PK = :gsi1pk')
      expect(input.UpdateExpression).toContain('GSI1SK = :gsi1sk')
      expect(input.ExpressionAttributeValues[':gsi1pk']).toBe('GITHUB#newusername')
      expect(input.ExpressionAttributeValues[':gsi1sk']).toBe('GITHUB#newusername')
    })

    it('excludes slackUserId from update expression', async () => {
      const updatedUser = createTestUser()

      mockDocClient.send.mockResolvedValue({
        Attributes: { ...updatedUser },
      })

      await dao.update('U_UPDATE', {
        slackUserId: 'U_DIFFERENT',
        digestEnabled: true,
      })

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      const input = sentCommand.input

      expect(input.ExpressionAttributeNames).not.toHaveProperty('#slackUserId')
      expect(input.ExpressionAttributeValues).not.toHaveProperty(':slackUserId')
    })

    it('requests ALL_NEW return values', async () => {
      const updatedUser = createTestUser()

      mockDocClient.send.mockResolvedValue({
        Attributes: { ...updatedUser },
      })

      await dao.update('U_UPDATE', { digestEnabled: true })

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      expect(sentCommand.input.ReturnValues).toBe('ALL_NEW')
    })

    it('returns the updated user', async () => {
      const updatedUser = createTestUser({
        slackUserId: 'U_UPDATE',
        digestEnabled: true,
      })

      mockDocClient.send.mockResolvedValue({
        Attributes: {
          PK: 'SLACK_USER#U_UPDATE',
          SK: 'SLACK_USER#U_UPDATE',
          ...updatedUser,
        },
      })

      const result = await dao.update('U_UPDATE', { digestEnabled: true })

      expect(result).toEqual(updatedUser)
    })
  })

  describe('delete', () => {
    it('sends DeleteCommand with correct key format', async () => {
      mockDocClient.send.mockResolvedValue({})

      await dao.delete('U_DELETE_123')

      expect(mockDocClient.send).toHaveBeenCalledTimes(1)

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      expect(sentCommand).toBeInstanceOf(DeleteCommand)

      const input = sentCommand.input
      expect(input.TableName).toBe(tableName)
      expect(input.Key).toEqual({
        PK: 'SLACK_USER#U_DELETE_123',
        SK: 'SLACK_USER#U_DELETE_123',
      })
    })

    it('does not throw when user does not exist', async () => {
      mockDocClient.send.mockResolvedValue({})

      await expect(dao.delete('U_NONEXISTENT')).resolves.toBeUndefined()
    })
  })

  describe('findByGithubUsername', () => {
    it('sends QueryCommand to GSI1 with lowercase username', async () => {
      mockDocClient.send.mockResolvedValue({ Items: [] })

      await dao.findByGithubUsername('OctoCat') // Mixed case input

      expect(mockDocClient.send).toHaveBeenCalledTimes(1)

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      expect(sentCommand).toBeInstanceOf(QueryCommand)

      const input = sentCommand.input
      expect(input.TableName).toBe(tableName)
      expect(input.IndexName).toBe('GSI1')
      expect(input.KeyConditionExpression).toBe('GSI1PK = :pk')
      expect(input.ExpressionAttributeValues).toEqual({
        ':pk': 'GITHUB#octocat', // Lowercase
      })
    })

    it('limits query to 1 result', async () => {
      mockDocClient.send.mockResolvedValue({ Items: [] })

      await dao.findByGithubUsername('testuser')

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      expect(sentCommand.input.Limit).toBe(1)
    })

    it('returns parsed user when found', async () => {
      const userData = createTestUser({
        slackUserId: 'U_GITHUB_USER',
        githubUsername: 'octocat',
      })

      mockDocClient.send.mockResolvedValue({
        Items: [{
          PK: 'SLACK_USER#U_GITHUB_USER',
          SK: 'SLACK_USER#U_GITHUB_USER',
          GSI1PK: 'GITHUB#octocat',
          GSI1SK: 'GITHUB#octocat',
          ...userData,
        }],
      })

      const result = await dao.findByGithubUsername('octocat')

      expect(result).toEqual(userData)
    })

    it('returns null when no user found', async () => {
      mockDocClient.send.mockResolvedValue({ Items: [] })

      const result = await dao.findByGithubUsername('nonexistent')

      expect(result).toBeNull()
    })

    it('returns null when Items is undefined', async () => {
      mockDocClient.send.mockResolvedValue({ Items: undefined })

      const result = await dao.findByGithubUsername('testuser')

      expect(result).toBeNull()
    })
  })

  describe('findByWorkspaceId', () => {
    it('sends QueryCommand to GSI2 with workspace key', async () => {
      mockDocClient.send.mockResolvedValue({ Items: [] })

      await dao.findByWorkspaceId('W_WORKSPACE_123')

      expect(mockDocClient.send).toHaveBeenCalledTimes(1)

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      expect(sentCommand).toBeInstanceOf(QueryCommand)

      const input = sentCommand.input
      expect(input.TableName).toBe(tableName)
      expect(input.IndexName).toBe('GSI2')
      expect(input.KeyConditionExpression).toBe('GSI2PK = :pk')
      expect(input.ExpressionAttributeValues).toEqual({
        ':pk': 'WORKSPACE#W_WORKSPACE_123',
      })
    })

    it('returns array of parsed users', async () => {
      const user1 = createTestUser({
        slackUserId: 'U_USER_1',
        slackWorkspaceId: 'W_WORKSPACE',
        githubUsername: 'user1',
      })
      const user2 = createTestUser({
        slackUserId: 'U_USER_2',
        slackWorkspaceId: 'W_WORKSPACE',
        githubUsername: 'user2',
      })

      mockDocClient.send.mockResolvedValue({
        Items: [
          { ...user1, PK: 'SLACK_USER#U_USER_1', SK: 'SLACK_USER#U_USER_1' },
          { ...user2, PK: 'SLACK_USER#U_USER_2', SK: 'SLACK_USER#U_USER_2' },
        ],
      })

      const result = await dao.findByWorkspaceId('W_WORKSPACE')

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual(user1)
      expect(result[1]).toEqual(user2)
    })

    it('returns empty array when no users found', async () => {
      mockDocClient.send.mockResolvedValue({ Items: [] })

      const result = await dao.findByWorkspaceId('W_EMPTY')

      expect(result).toEqual([])
    })

    it('returns empty array when Items is undefined', async () => {
      mockDocClient.send.mockResolvedValue({ Items: undefined })

      const result = await dao.findByWorkspaceId('W_UNDEFINED')

      expect(result).toEqual([])
    })
  })

  describe('countByWorkspaceId', () => {
    it('sends QueryCommand to GSI2 with SELECT COUNT', async () => {
      mockDocClient.send.mockResolvedValue({ Count: 0 })

      await dao.countByWorkspaceId('W_WORKSPACE_123')

      expect(mockDocClient.send).toHaveBeenCalledTimes(1)

      const sentCommand = mockDocClient.send.mock.calls[0][0]
      expect(sentCommand).toBeInstanceOf(QueryCommand)

      const input = sentCommand.input
      expect(input.TableName).toBe(tableName)
      expect(input.IndexName).toBe('GSI2')
      expect(input.KeyConditionExpression).toBe('GSI2PK = :pk')
      expect(input.Select).toBe('COUNT')
      expect(input.ExpressionAttributeValues).toEqual({
        ':pk': 'WORKSPACE#W_WORKSPACE_123',
      })
    })

    it('returns the count from response', async () => {
      mockDocClient.send.mockResolvedValue({ Count: 42 })

      const result = await dao.countByWorkspaceId('W_WORKSPACE')

      expect(result).toBe(42)
    })

    it('returns 0 when Count is undefined', async () => {
      mockDocClient.send.mockResolvedValue({ Count: undefined })

      const result = await dao.countByWorkspaceId('W_EMPTY')

      expect(result).toBe(0)
    })

    it('returns 0 when no users in workspace', async () => {
      mockDocClient.send.mockResolvedValue({ Count: 0 })

      const result = await dao.countByWorkspaceId('W_NO_USERS')

      expect(result).toBe(0)
    })
  })
})
