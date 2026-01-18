/**
 * Slack Block Kit types for building rich messages
 * These are simplified versions - @slack/web-api has full types
 */

/**
 * Text object for Block Kit
 */
export interface SlackTextObject {
  type: 'plain_text' | 'mrkdwn'
  text: string
  emoji?: boolean
}

/**
 * Image element for context blocks
 */
export interface SlackImageElement {
  type: 'image'
  image_url: string
  alt_text: string
}

/**
 * Button element for action blocks
 */
export interface SlackButtonElement {
  type: 'button'
  text: SlackTextObject
  action_id: string
  url?: string
  style?: 'primary' | 'danger'
}

/**
 * Header block
 */
export interface SlackHeaderBlock {
  type: 'header'
  text: SlackTextObject
}

/**
 * Section block
 */
export interface SlackSectionBlock {
  type: 'section'
  text?: SlackTextObject
  fields?: SlackTextObject[]
  accessory?: SlackButtonElement | SlackImageElement
}

/**
 * Context block
 */
export interface SlackContextBlock {
  type: 'context'
  elements: Array<SlackTextObject | SlackImageElement>
}

/**
 * Divider block
 */
export interface SlackDividerBlock {
  type: 'divider'
}

/**
 * Actions block
 */
export interface SlackActionsBlock {
  type: 'actions'
  elements: SlackButtonElement[]
}

/**
 * Union of all block types
 */
export type SlackBlock =
  | SlackHeaderBlock
  | SlackSectionBlock
  | SlackContextBlock
  | SlackDividerBlock
  | SlackActionsBlock

/**
 * Slack message payload
 */
export interface SlackMessage {
  /** Channel ID or user ID for DMs */
  channel: string
  /** Fallback text for notifications */
  text: string
  /** Block Kit blocks */
  blocks: SlackBlock[]
}

/**
 * Response from Slack API when sending a message
 */
export interface SlackMessageResponse {
  ok: boolean
  channel?: string
  ts?: string
  error?: string
}
