import { SendMessageBatchCommand, SendMessageCommand } from '@aws-sdk/client-sqs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMockSQSClient, createTestNotification } from '../testing/index'
import type { MockSQSClient } from '../testing/index'

import { NotificationQueueImpl } from './notification-queue-impl'

describe('NotificationQueueImpl', () => {
  const queueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789012/notifications.fifo'
  let mockSQSClient: MockSQSClient
  let queue: NotificationQueueImpl

  beforeEach(() => {
    vi.clearAllMocks()
    mockSQSClient = createMockSQSClient()
    // Pass the mock client to the constructor
    queue = new NotificationQueueImpl(queueUrl, mockSQSClient)
  })

  describe('send', () => {
    it('sends notification with correct message format', async () => {
      mockSQSClient.send.mockResolvedValue({})

      const notification = createTestNotification({
        id: 'notif_123',
        targetSlackUserId: 'U12345678',
      })

      await queue.send(notification)

      expect(mockSQSClient.send).toHaveBeenCalledTimes(1)

      // Get the command that was sent
      const sentCommand = mockSQSClient.send.mock.calls[0][0]
      expect(sentCommand).toBeInstanceOf(SendMessageCommand)

      // Verify command input properties
      const input = sentCommand.input
      expect(input.QueueUrl).toBe(queueUrl)
      expect(input.MessageBody).toBe(JSON.stringify(notification))
    })

    it('uses notification ID as deduplication ID for FIFO queue', async () => {
      mockSQSClient.send.mockResolvedValue({})

      const notification = createTestNotification({
        id: 'notif_unique_456',
      })

      await queue.send(notification)

      const sentCommand = mockSQSClient.send.mock.calls[0][0]
      expect(sentCommand.input.MessageDeduplicationId).toBe('notif_unique_456')
    })

    it('uses target Slack user ID as message group ID to maintain order per user', async () => {
      mockSQSClient.send.mockResolvedValue({})

      const notification = createTestNotification({
        targetSlackUserId: 'U_TARGET_USER',
      })

      await queue.send(notification)

      const sentCommand = mockSQSClient.send.mock.calls[0][0]
      expect(sentCommand.input.MessageGroupId).toBe('U_TARGET_USER')
    })
  })

  describe('sendBatch', () => {
    it('sends single batch for 10 or fewer notifications', async () => {
      mockSQSClient.send.mockResolvedValue({})

      const notifications = Array.from({ length: 5 }, (_, i) =>
        createTestNotification({
          id: `notif_${i}`,
          targetSlackUserId: `U_USER_${i}`,
        }))

      await queue.sendBatch(notifications)

      expect(mockSQSClient.send).toHaveBeenCalledTimes(1)

      const sentCommand = mockSQSClient.send.mock.calls[0][0]
      expect(sentCommand).toBeInstanceOf(SendMessageBatchCommand)
      expect(sentCommand.input.Entries).toHaveLength(5)
    })

    it('sends exactly 10 notifications in single batch', async () => {
      mockSQSClient.send.mockResolvedValue({})

      const notifications = Array.from({ length: 10 }, (_, i) =>
        createTestNotification({
          id: `notif_${i}`,
          targetSlackUserId: `U_USER_${i}`,
        }))

      await queue.sendBatch(notifications)

      expect(mockSQSClient.send).toHaveBeenCalledTimes(1)

      const sentCommand = mockSQSClient.send.mock.calls[0][0]
      expect(sentCommand.input.Entries).toHaveLength(10)
    })

    it('splits into multiple batches when more than 10 notifications', async () => {
      mockSQSClient.send.mockResolvedValue({})

      const notifications = Array.from({ length: 25 }, (_, i) =>
        createTestNotification({
          id: `notif_${i}`,
          targetSlackUserId: `U_USER_${i}`,
        }))

      await queue.sendBatch(notifications)

      // Should split into 3 batches: 10 + 10 + 5
      expect(mockSQSClient.send).toHaveBeenCalledTimes(3)

      const firstBatch = mockSQSClient.send.mock.calls[0][0]
      const secondBatch = mockSQSClient.send.mock.calls[1][0]
      const thirdBatch = mockSQSClient.send.mock.calls[2][0]

      expect(firstBatch.input.Entries).toHaveLength(10)
      expect(secondBatch.input.Entries).toHaveLength(10)
      expect(thirdBatch.input.Entries).toHaveLength(5)
    })

    it('does not send any commands for empty array', async () => {
      mockSQSClient.send.mockResolvedValue({})

      await queue.sendBatch([])

      expect(mockSQSClient.send).not.toHaveBeenCalled()
    })

    it('creates batch entries with correct format', async () => {
      mockSQSClient.send.mockResolvedValue({})

      const notifications = [
        createTestNotification({
          id: 'notif_first',
          targetSlackUserId: 'U_FIRST',
        }),
        createTestNotification({
          id: 'notif_second',
          targetSlackUserId: 'U_SECOND',
        }),
      ]

      await queue.sendBatch(notifications)

      const sentCommand = mockSQSClient.send.mock.calls[0][0]
      const entries = sentCommand.input.Entries

      // Verify first entry
      expect(entries[0].Id).toBe('0')
      expect(entries[0].MessageBody).toBe(JSON.stringify(notifications[0]))
      expect(entries[0].MessageDeduplicationId).toBe('notif_first')
      expect(entries[0].MessageGroupId).toBe('U_FIRST')

      // Verify second entry
      expect(entries[1].Id).toBe('1')
      expect(entries[1].MessageBody).toBe(JSON.stringify(notifications[1]))
      expect(entries[1].MessageDeduplicationId).toBe('notif_second')
      expect(entries[1].MessageGroupId).toBe('U_SECOND')
    })

    it('uses correct entry IDs across multiple batches', async () => {
      mockSQSClient.send.mockResolvedValue({})

      const notifications = Array.from({ length: 15 }, (_, i) =>
        createTestNotification({
          id: `notif_${i}`,
          targetSlackUserId: `U_USER_${i}`,
        }))

      await queue.sendBatch(notifications)

      // First batch: IDs 0-9
      const firstBatch = mockSQSClient.send.mock.calls[0][0]
      expect(firstBatch.input.Entries[0].Id).toBe('0')
      expect(firstBatch.input.Entries[9].Id).toBe('9')

      // Second batch: IDs 10-14
      const secondBatch = mockSQSClient.send.mock.calls[1][0]
      expect(secondBatch.input.Entries[0].Id).toBe('10')
      expect(secondBatch.input.Entries[4].Id).toBe('14')
    })

    it('sends to correct queue URL', async () => {
      mockSQSClient.send.mockResolvedValue({})

      const notifications = [createTestNotification()]

      await queue.sendBatch(notifications)

      const sentCommand = mockSQSClient.send.mock.calls[0][0]
      expect(sentCommand.input.QueueUrl).toBe(queueUrl)
    })
  })
})
