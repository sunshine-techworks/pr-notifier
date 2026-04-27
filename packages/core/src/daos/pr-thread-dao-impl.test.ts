import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMockDynamoDBDocumentClient } from '../testing/index'
import type { MockDynamoDBDocumentClient } from '../testing/index'
import type { PrThread } from '../types/index'

import { PrThreadDaoImpl } from './pr-thread-dao-impl'

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60

function createTestThread(overrides?: Partial<PrThread>): PrThread {
  return {
    slackUserId: 'U_USER_123',
    repository: 'octo/widgets',
    prNumber: 42,
    channelId: 'D_DM_CHANNEL',
    threadTs: '1700000000.000100',
    createdAt: new Date('2026-04-27T10:00:00Z').toISOString(),
    ...overrides,
  }
}

describe('PrThreadDaoImpl', () => {
  const tableName = 'pr-notify-pr-threads-test'
  let mockDocClient: MockDynamoDBDocumentClient
  let dao: PrThreadDaoImpl

  beforeEach(() => {
    vi.clearAllMocks()
    mockDocClient = createMockDynamoDBDocumentClient()
    dao = new PrThreadDaoImpl(mockDocClient, tableName)
  })

  describe('findThread', () => {
    it('sends GetCommand with composite PR thread key', async () => {
      mockDocClient.send.mockResolvedValue({})

      await dao.findThread('U_USER_123', 'octo/widgets', 42)

      const sent = mockDocClient.send.mock.calls[0][0]
      expect(sent).toBeInstanceOf(GetCommand)
      expect(sent.input.TableName).toBe(tableName)
      expect(sent.input.Key.PK).toBe('SLACK_USER#U_USER_123')
      // Repository (which contains a slash) is embedded between # delimiters
      expect(sent.input.Key.SK).toBe('PR#octo/widgets#42')
    })

    it('returns null when DynamoDB has no record', async () => {
      mockDocClient.send.mockResolvedValue({})

      const result = await dao.findThread('U_USER_123', 'octo/widgets', 42)

      expect(result).toBeNull()
    })

    it('parses and returns the PrThread when present, stripping storage-only fields', async () => {
      const thread = createTestThread()
      mockDocClient.send.mockResolvedValue({
        Item: {
          // Storage-level keys that should be stripped by the schema parse
          PK: 'SLACK_USER#U_USER_123',
          SK: 'PR#octo/widgets#42',
          ttl: 9999999999,
          ...thread,
        },
      })

      const result = await dao.findThread('U_USER_123', 'octo/widgets', 42)

      expect(result).toEqual(thread)
    })
  })

  describe('createThread', () => {
    beforeEach(() => {
      // Pin Date.now so we can assert the computed TTL deterministically
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-04-27T10:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('persists item with composite key, TTL, and conditional expression', async () => {
      mockDocClient.send.mockResolvedValue({})
      const thread = createTestThread()

      await dao.createThread(thread)

      const sent = mockDocClient.send.mock.calls[0][0]
      expect(sent).toBeInstanceOf(PutCommand)
      const item = sent.input.Item
      expect(item.PK).toBe('SLACK_USER#U_USER_123')
      expect(item.SK).toBe('PR#octo/widgets#42')
      expect(item.threadTs).toBe(thread.threadTs)
      expect(item.channelId).toBe(thread.channelId)

      const expectedTtl = Math.floor(Date.now() / 1000) + THIRTY_DAYS_SECONDS
      expect(item.ttl).toBe(expectedTtl)

      expect(sent.input.ConditionExpression).toBe('attribute_not_exists(PK)')
    })

    it('returns created: true when the conditional write succeeds', async () => {
      mockDocClient.send.mockResolvedValue({})

      const result = await dao.createThread(createTestThread())

      expect(result).toEqual({ created: true })
    })

    it('returns created: false when another writer already populated the record', async () => {
      mockDocClient.send.mockRejectedValue(
        new ConditionalCheckFailedException({
          $metadata: {},
          message: 'The conditional request failed',
        }),
      )

      const result = await dao.createThread(createTestThread())

      expect(result).toEqual({ created: false })
    })

    it('re-throws non-conditional DynamoDB errors so callers retry via SQS', async () => {
      mockDocClient.send.mockRejectedValue(new Error('throughput exceeded'))

      await expect(dao.createThread(createTestThread())).rejects.toThrow(
        'throughput exceeded',
      )
    })
  })
})
