import * as cdk from 'aws-cdk-lib'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import type { Construct } from 'constructs'

/**
 * Queues construct for PR Notify
 * Creates SQS queues with Dead Letter Queue for reliable notification processing
 */
export class QueuesConstruct extends cdk.NestedStack {
  public readonly notificationQueue: sqs.Queue
  public readonly deadLetterQueue: sqs.Queue

  constructor(scope: Construct, id: string) {
    super(scope, id)

    // Dead Letter Queue for failed notification messages
    // Messages that fail processing after max retries end up here for investigation
    this.deadLetterQueue = new sqs.Queue(this, 'NotificationDLQ', {
      queueName: 'pr-notify-notifications-dlq',
      // Retain failed messages for 14 days for debugging
      retentionPeriod: cdk.Duration.days(14),
    })

    // Main notification queue for processing GitHub events
    // Decouples webhook ingestion from notification sending for reliability
    this.notificationQueue = new sqs.Queue(this, 'NotificationQueue', {
      queueName: 'pr-notify-notifications',
      // 30 second visibility timeout allows Lambda processing time
      visibilityTimeout: cdk.Duration.seconds(30),
      // Keep messages for 4 days if processing is delayed
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: {
        queue: this.deadLetterQueue,
        // Move to DLQ after 3 failed processing attempts
        maxReceiveCount: 3,
      },
    })
  }
}
