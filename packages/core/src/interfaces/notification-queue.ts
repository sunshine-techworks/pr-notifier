import type { Notification } from '../types/index'

/**
 * Queue interface for notification processing
 */
export interface NotificationQueue {
  /**
   * Send a notification to the queue for async processing
   */
  send(notification: Notification): Promise<void>

  /**
   * Send multiple notifications in a batch
   */
  sendBatch(notifications: Notification[]): Promise<void>
}
