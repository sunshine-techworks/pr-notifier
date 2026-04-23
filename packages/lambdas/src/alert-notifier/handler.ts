import { WebClient } from '@slack/web-api'
import type { SNSEvent } from 'aws-lambda'

const ALERT_SLACK_BOT_TOKEN = process.env['ALERT_SLACK_BOT_TOKEN'] ?? ''
const OWNER_SLACK_USER_ID = process.env['OWNER_SLACK_USER_ID'] ?? ''

const slackClient = new WebClient(ALERT_SLACK_BOT_TOKEN)

/** Type guard for safely accessing untyped SNS alarm payloads */
const isRecord = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null

/**
 * Lambda handler triggered by SNS when CloudWatch alarms fire.
 * Sends a formatted Slack DM to the app owner with alarm details.
 * Uses WebClient directly (not SlackClientFactory) to avoid DynamoDB
 * dependency so alerts work even if DynamoDB is the thing that's down.
 */
export async function handler(event: SNSEvent): Promise<void> {
  for (const record of event.Records) {
    const message: unknown = JSON.parse(record.Sns.Message)

    if (!isRecord(message)) {
      console.error('Unexpected SNS message format', { message })
      continue
    }

    const alarmName = String(message['AlarmName'] ?? 'Unknown Alarm')
    const newState = String(message['NewStateValue'] ?? 'UNKNOWN')
    const description = String(message['AlarmDescription'] ?? '')
    const reason = String(message['NewStateReason'] ?? '')
    const region = String(message['Region'] ?? '')
    const changeTime = String(message['StateChangeTime'] ?? '')

    const emoji = newState === 'ALARM' ? ':rotating_light:' : ':white_check_mark:'

    await slackClient.chat.postMessage({
      channel: OWNER_SLACK_USER_ID,
      text: `${emoji} ${alarmName} is now ${newState}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `${emoji} CloudWatch Alarm`, emoji: true },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Alarm:*\n${alarmName}` },
            { type: 'mrkdwn', text: `*State:*\n${newState}` },
          ],
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Description:*\n${description}` },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Reason:*\n${reason}` },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Region: ${region} | Changed at: ${changeTime}`,
            },
          ],
        },
      ],
    })

    console.log('Alert sent to owner', { alarmName, newState })
  }
}
