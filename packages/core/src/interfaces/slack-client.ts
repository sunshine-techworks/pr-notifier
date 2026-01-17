import type { SlackMessage, SlackMessageResponse } from '../types/index'

/**
 * Client interface for Slack API interactions
 */
export interface SlackClient {
  /**
   * Send a direct message to a user
   */
  sendDirectMessage(
    userId: string,
    message: SlackMessage
  ): Promise<SlackMessageResponse>

  /**
   * Send a message to a channel
   */
  sendChannelMessage(
    channelId: string,
    message: SlackMessage
  ): Promise<SlackMessageResponse>

  /**
   * Update an existing message
   */
  updateMessage(
    channelId: string,
    messageTs: string,
    message: SlackMessage
  ): Promise<SlackMessageResponse>

  /**
   * Look up a user's info by their Slack ID
   */
  getUserInfo(userId: string): Promise<{
    id: string
    name: string
    realName?: string
    email?: string
    timezone?: string
  } | null>

  /**
   * Verify a Slack request signature
   */
  verifySignature(
    signature: string,
    timestamp: string,
    body: string
  ): boolean
}
