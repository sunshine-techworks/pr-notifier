import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as cdk from 'aws-cdk-lib'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as cw_actions from 'aws-cdk-lib/aws-cloudwatch-actions'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import type { Construct } from 'constructs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export interface ObservabilityConstructProps {
  webhookIngestLambda: lambda.Function
  notificationProcessorLambda: lambda.Function
  slackCommandsLambda: lambda.Function
  slackEventsLambda: lambda.Function
  slackOAuthLambda: lambda.Function
  githubOAuthLambda: lambda.Function
  deadLetterQueue: sqs.Queue
  notificationQueue: sqs.Queue
}

/**
 * Observability construct for PR Notify.
 * Creates a CloudWatch dashboard, alarms, SNS topic, and an
 * alert-notifier Lambda that sends alarm notifications as Slack DMs.
 */
export class ObservabilityConstruct extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: ObservabilityConstructProps) {
    super(scope, id)

    // --- SNS Topic for alarm notifications ---
    const alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: 'pr-notify-alerts',
      displayName: 'PR Notify Alerts',
    })

    // --- Alert-notifier Lambda ---
    const alertSlackBotToken = ssm.StringParameter.fromStringParameterName(
      this,
      'AlertSlackBotTokenParam',
      '/pr-notify/slack-bot-token',
    )
    const ownerSlackUserId = ssm.StringParameter.fromStringParameterName(
      this,
      'OwnerSlackUserIdParam',
      '/pr-notify/owner-slack-user-id',
    )

    const lambdasPath = join(__dirname, '../../../lambdas/src')

    const alertNotifierLambda = new lambdaNodejs.NodejsFunction(this, 'AlertNotifierLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      functionName: 'pr-notify-alert-notifier',
      entry: join(lambdasPath, 'alert-notifier/handler.ts'),
      handler: 'handler',
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node22',
        format: lambdaNodejs.OutputFormat.ESM,
        externalModules: ['@aws-sdk/*'],
        mainFields: ['module', 'main'],
        banner:
          "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
      description: 'Sends CloudWatch alarm notifications to app owner via Slack DM',
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        ALERT_SLACK_BOT_TOKEN: alertSlackBotToken.stringValue,
        OWNER_SLACK_USER_ID: ownerSlackUserId.stringValue,
      },
    })

    // SNS triggers the alert Lambda
    alertTopic.addSubscription(
      new snsSubscriptions.LambdaSubscription(alertNotifierLambda),
    )

    // --- CloudWatch Alarms ---

    // Alarm 1: DLQ has messages (notifications failing repeatedly)
    const dlqAlarm = new cloudwatch.Alarm(this, 'DlqAlarm', {
      alarmName: 'PRNotify-DLQ-NotEmpty',
      metric: props.deadLetterQueue.metricApproximateNumberOfMessagesVisible({
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum',
      }),
      threshold: 0,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Notifications are landing in the DLQ. Check notification-processor logs.',
    })
    dlqAlarm.addAlarmAction(new cw_actions.SnsAction(alertTopic))
    dlqAlarm.addOkAction(new cw_actions.SnsAction(alertTopic))

    // Alarm 2: Webhook ingest Lambda errors
    const webhookErrorAlarm = new cloudwatch.Alarm(this, 'WebhookIngestErrorAlarm', {
      alarmName: 'PRNotify-WebhookIngest-Errors',
      metric: props.webhookIngestLambda.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 5,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Webhook ingest Lambda error rate elevated. Check webhook-ingest logs.',
    })
    webhookErrorAlarm.addAlarmAction(new cw_actions.SnsAction(alertTopic))
    webhookErrorAlarm.addOkAction(new cw_actions.SnsAction(alertTopic))

    // Alarm 3: Notification processor Lambda errors
    const processorErrorAlarm = new cloudwatch.Alarm(this, 'NotificationProcessorErrorAlarm', {
      alarmName: 'PRNotify-NotificationProcessor-Errors',
      metric: props.notificationProcessorLambda.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 5,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription:
        'Notification processor error rate elevated. Check notification-processor logs.',
    })
    processorErrorAlarm.addAlarmAction(new cw_actions.SnsAction(alertTopic))
    processorErrorAlarm.addOkAction(new cw_actions.SnsAction(alertTopic))

    // --- CloudWatch Dashboard ---

    const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: 'PRNotify',
      // Widgets are added via addWidgets() below
    })

    // Row 1: Webhooks, Notification Flow, DLQ
    // Note: widgets are added individually to work around CDK GraphWidget
    // type incompatibility with exactOptionalPropertyTypes
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Webhooks Processed',
        width: 8,
        right: [],
        left: [
          new cloudwatch.Metric({
            namespace: 'PRNotify',
            metricName: 'WebhooksProcessed',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: 'PRNotify',
            metricName: 'WebhooksIgnored',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'Notification Flow',
        width: 8,
        right: [],
        left: [
          new cloudwatch.Metric({
            namespace: 'PRNotify',
            metricName: 'NotificationsQueued',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Queued (webhook-ingest)',
          }),
          new cloudwatch.Metric({
            namespace: 'PRNotify',
            metricName: 'NotificationsSent',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Sent (notification-processor)',
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'DLQ Depth',
        width: 8,
        right: [],
        left: [
          props.deadLetterQueue.metricApproximateNumberOfMessagesVisible({
            period: cdk.Duration.minutes(1),
            statistic: 'Maximum',
          }),
        ],
      }),
    )

    // Row 2: Lambda Errors, Processing Latency, Workspaces
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Errors',
        width: 8,
        right: [],
        left: [
          props.webhookIngestLambda.metricErrors({
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
          props.notificationProcessorLambda.metricErrors({
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
          props.slackEventsLambda.metricErrors({
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
          props.slackCommandsLambda.metricErrors({
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
          props.slackOAuthLambda.metricErrors({
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
          props.githubOAuthLambda.metricErrors({
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'Processing Latency',
        width: 8,
        right: [],
        left: [
          new cloudwatch.Metric({
            namespace: 'PRNotify',
            metricName: 'ProcessingLatency',
            statistic: 'p50',
            period: cdk.Duration.minutes(5),
            label: 'p50',
          }),
          new cloudwatch.Metric({
            namespace: 'PRNotify',
            metricName: 'ProcessingLatency',
            statistic: 'p99',
            period: cdk.Duration.minutes(5),
            label: 'p99',
          }),
        ],
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Workspaces (24h)',
        width: 8,
        metrics: [
          new cloudwatch.Metric({
            namespace: 'PRNotify',
            metricName: 'WorkspacesInstalled',
            statistic: 'Sum',
            period: cdk.Duration.hours(24),
          }),
          new cloudwatch.Metric({
            namespace: 'PRNotify',
            metricName: 'WorkspacesUninstalled',
            statistic: 'Sum',
            period: cdk.Duration.hours(24),
          }),
        ],
      }),
    )

    // Row 3: PR Threading -- hit rate (replies vs top-level) and race counter.
    // Race detection counts the duplicate top-level DMs caused by concurrent
    // SQS records for the same PR (see notification-processor handler comment).
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'PR Thread Hit Rate',
        width: 12,
        right: [],
        left: [
          new cloudwatch.Metric({
            namespace: 'PRNotify',
            metricName: 'NotificationsThreaded',
            dimensionsMap: { Threaded: 'true' },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Threaded reply',
          }),
          new cloudwatch.Metric({
            namespace: 'PRNotify',
            metricName: 'NotificationsThreaded',
            dimensionsMap: { Threaded: 'false' },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Top-level',
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'PR Thread Race (duplicate top-level DMs)',
        width: 12,
        right: [],
        left: [
          new cloudwatch.Metric({
            namespace: 'PRNotify',
            metricName: 'PrThreadRaceDetected',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
      }),
    )
  }
}
