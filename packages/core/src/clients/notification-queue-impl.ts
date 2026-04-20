import { SendMessageBatchCommand, SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'

import type { NotificationQueue } from '../interfaces/index'
import type { Notification } from '../types/index'

/**
 * SQS implementation of NotificationQueue
 */
export class NotificationQueueImpl implements NotificationQueue {
  private readonly client: SQSClient

  constructor(
    private readonly queueUrl: string,
    client?: SQSClient,
  ) {
    this.client = client ?? new SQSClient({})
  }

  async send(notification: Notification): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(notification),
      }),
    )
  }

  async sendBatch(notifications: Notification[]): Promise<void> {
    // SQS batch limit is 10 messages
    const batchSize = 10

    for (let i = 0; i < notifications.length; i += batchSize) {
      const batch = notifications.slice(i, i + batchSize)

      await this.client.send(
        new SendMessageBatchCommand({
          QueueUrl: this.queueUrl,
          Entries: batch.map((notification, index) => ({
            Id: `${i + index}`,
            MessageBody: JSON.stringify(notification),
          })),
        }),
      )
    }
  }
}
