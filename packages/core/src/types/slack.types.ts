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
 * Option object used in checkbox groups and select menus
 */
export interface SlackOption {
  text: SlackTextObject
  value: string
  description?: SlackTextObject
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
 * Checkbox group element for action blocks.
 * initial_options controls which checkboxes are pre-selected.
 */
export interface SlackCheckboxElement {
  type: 'checkboxes'
  action_id: string
  options: SlackOption[]
  initial_options?: SlackOption[]
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
 * Actions block — supports buttons and checkbox groups
 */
export interface SlackActionsBlock {
  type: 'actions'
  elements: Array<SlackButtonElement | SlackCheckboxElement>
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

/**
 * App Home view published via views.publish.
 * Structurally different from SlackMessage — views have no channel or fallback text.
 */
export interface SlackAppHomeView {
  type: 'home'
  blocks: SlackBlock[]
}
