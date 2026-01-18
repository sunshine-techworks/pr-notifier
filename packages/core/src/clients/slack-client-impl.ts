import { createHmac, timingSafeEqual } from 'node:crypto'

import { WebClient } from '@slack/web-api'

import type { SlackClient } from '../interfaces/index'
import type { SlackMessage, SlackMessageResponse } from '../types/index'

/**
 * Slack Web API implementation of SlackClient
 */
export class SlackClientImpl implements SlackClient {
  private readonly client: WebClient

  constructor(
    private readonly botToken: string,
    private readonly signingSecret: string,
  ) {
    this.client = new WebClient(botToken)
  }

  async sendDirectMessage(
    userId: string,
    message: SlackMessage,
  ): Promise<SlackMessageResponse> {
    try {
      const result = await this.client.chat.postMessage({
        channel: userId,
        text: message.text,
        blocks: message.blocks,
      })

      return {
        ok: result.ok ?? false,
        // Only include channel/ts if they exist (satisfies exactOptionalPropertyTypes)
        ...(result.channel ? { channel: result.channel } : {}),
        ...(result.ts ? { ts: result.ts } : {}),
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return {
        ok: false,
        error: errorMessage,
      }
    }
  }

  async sendChannelMessage(
    channelId: string,
    message: SlackMessage,
  ): Promise<SlackMessageResponse> {
    try {
      const result = await this.client.chat.postMessage({
        channel: channelId,
        text: message.text,
        blocks: message.blocks,
      })

      return {
        ok: result.ok ?? false,
        ...(result.channel ? { channel: result.channel } : {}),
        ...(result.ts ? { ts: result.ts } : {}),
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return {
        ok: false,
        error: errorMessage,
      }
    }
  }

  async updateMessage(
    channelId: string,
    messageTs: string,
    message: SlackMessage,
  ): Promise<SlackMessageResponse> {
    try {
      const result = await this.client.chat.update({
        channel: channelId,
        ts: messageTs,
        text: message.text,
        blocks: message.blocks,
      })

      return {
        ok: result.ok ?? false,
        ...(result.channel ? { channel: result.channel } : {}),
        ...(result.ts ? { ts: result.ts } : {}),
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return {
        ok: false,
        error: errorMessage,
      }
    }
  }

  async getUserInfo(userId: string): Promise<
    {
      id: string
      name: string
      realName?: string
      email?: string
      timezone?: string
    } | null
  > {
    try {
      const result = await this.client.users.info({ user: userId })

      if (!result.ok || !result.user) {
        return null
      }

      return {
        id: result.user.id ?? userId,
        name: result.user.name ?? '',
        // Only include optional properties if they have values
        ...(result.user.real_name ? { realName: result.user.real_name } : {}),
        ...(result.user.profile?.email ? { email: result.user.profile.email } : {}),
        ...(result.user.tz ? { timezone: result.user.tz } : {}),
      }
    } catch {
      return null
    }
  }

  verifySignature(
    signature: string,
    timestamp: string,
    body: string,
  ): boolean {
    // Verify request is not too old (5 minutes)
    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5
    if (parseInt(timestamp, 10) < fiveMinutesAgo) {
      return false
    }

    // Compute expected signature
    const sigBaseString = `v0:${timestamp}:${body}`
    const expectedSignature = 'v0='
      + createHmac('sha256', this.signingSecret)
        .update(sigBaseString)
        .digest('hex')

    // Compare signatures using timing-safe comparison
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    )
  }
}
