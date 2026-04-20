import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources'
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import type { Construct } from 'constructs'

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export interface LambdasConstructProps {
  usersTable: dynamodb.Table
  workspacesTable: dynamodb.Table
  notificationQueue: sqs.Queue
}

/**
 * Lambdas construct for PR Notify.
 * Creates all Lambda functions with proper bundling and permissions.
 */
export class LambdasConstruct extends cdk.NestedStack {
  public readonly webhookIngestLambda: lambda.Function
  public readonly notificationProcessorLambda: lambda.Function
  public readonly slackCommandsLambda: lambda.Function
  public readonly slackEventsLambda: lambda.Function
  public readonly slackOAuthLambda: lambda.Function

  constructor(scope: Construct, id: string, props: LambdasConstructProps) {
    super(scope, id)

    // Resolve secrets from SSM Parameter Store at deploy time
    const slackBotToken = ssm.StringParameter.fromStringParameterName(
      this,
      'SlackBotTokenParam',
      '/pr-notify/slack-bot-token',
    )
    const slackSigningSecret = ssm.StringParameter.fromStringParameterName(
      this,
      'SlackSigningSecretParam',
      '/pr-notify/slack-signing-secret',
    )
    const githubWebhookSecret = ssm.StringParameter.fromStringParameterName(
      this,
      'GitHubWebhookSecretParam',
      '/pr-notify/github-webhook-secret',
    )
    const slackClientId = ssm.StringParameter.fromStringParameterName(
      this,
      'SlackClientIdParam',
      '/pr-notify/slack-client-id',
    )
    const slackClientSecret = ssm.StringParameter.fromStringParameterName(
      this,
      'SlackClientSecretParam',
      '/pr-notify/slack-client-secret',
    )
    const slackAppId = ssm.StringParameter.fromStringParameterName(
      this,
      'SlackAppIdParam',
      '/pr-notify/slack-app-id',
    )

    // Shared Lambda configuration for existing handlers.
    // SLACK_BOT_TOKEN remains as a fallback during migration to per-workspace tokens.
    const sharedConfig = {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        USERS_TABLE_NAME: props.usersTable.tableName,
        WORKSPACES_TABLE_NAME: props.workspacesTable.tableName,
        NOTIFICATION_QUEUE_URL: props.notificationQueue.queueUrl,
        SLACK_BOT_TOKEN: slackBotToken.stringValue,
        SLACK_SIGNING_SECRET: slackSigningSecret.stringValue,
        GITHUB_WEBHOOK_SECRET: githubWebhookSecret.stringValue,
      },
    }

    const lambdasPath = join(__dirname, '../../../lambdas/src')

    const bundlingConfig = {
      minify: true,
      sourceMap: true,
      target: 'node22',
      format: lambdaNodejs.OutputFormat.ESM,
      externalModules: ['@aws-sdk/*'],
      mainFields: ['module', 'main'],
      // Shim CJS require() for dependencies like @slack/web-api that use
      // dynamic require('node:...') internally, which breaks in ESM bundles
      banner:
        "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
    }

    // --- Existing Lambda functions ---

    this.webhookIngestLambda = new lambdaNodejs.NodejsFunction(this, 'WebhookIngestLambda', {
      ...sharedConfig,
      functionName: 'pr-notify-webhook-ingest',
      entry: join(lambdasPath, 'webhook-ingest/handler.ts'),
      handler: 'handler',
      bundling: bundlingConfig,
      description: 'Ingests GitHub webhooks and queues notifications',
    })

    this.notificationProcessorLambda = new lambdaNodejs.NodejsFunction(
      this,
      'NotificationProcessorLambda',
      {
        ...sharedConfig,
        functionName: 'pr-notify-notification-processor',
        entry: join(lambdasPath, 'notification-processor/handler.ts'),
        handler: 'handler',
        bundling: bundlingConfig,
        description: 'Processes notifications from SQS and sends Slack DMs',
      },
    )

    this.slackCommandsLambda = new lambdaNodejs.NodejsFunction(this, 'SlackCommandsLambda', {
      ...sharedConfig,
      functionName: 'pr-notify-slack-commands',
      entry: join(lambdasPath, 'slack-commands/handler.ts'),
      handler: 'handler',
      bundling: bundlingConfig,
      description: 'Handles Slack slash commands for PR Notify',
    })

    this.slackEventsLambda = new lambdaNodejs.NodejsFunction(this, 'SlackEventsLambda', {
      ...sharedConfig,
      functionName: 'pr-notify-slack-events',
      entry: join(lambdasPath, 'slack-events/handler.ts'),
      handler: 'handler',
      bundling: bundlingConfig,
      description: 'Handles Slack Events API callbacks',
    })

    // --- New OAuth Lambda ---

    this.slackOAuthLambda = new lambdaNodejs.NodejsFunction(this, 'SlackOAuthLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      functionName: 'pr-notify-slack-oauth',
      entry: join(lambdasPath, 'slack-oauth/handler.ts'),
      handler: 'handler',
      bundling: bundlingConfig,
      description: 'Handles Slack OAuth 2.0 install flow',
      // Only the OAuth-specific env vars needed (no bot token or signing secret)
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        WORKSPACES_TABLE_NAME: props.workspacesTable.tableName,
        SLACK_CLIENT_ID: slackClientId.stringValue,
        SLACK_CLIENT_SECRET: slackClientSecret.stringValue,
        SLACK_APP_ID: slackAppId.stringValue,
      },
    })

    // --- Permissions ---

    // Webhook ingest: queue + users read
    props.notificationQueue.grantSendMessages(this.webhookIngestLambda)
    props.usersTable.grantReadData(this.webhookIngestLambda)

    // Notification processor: SQS source + users read + workspaces read (token lookup)
    this.notificationProcessorLambda.addEventSource(
      new lambdaEventSources.SqsEventSource(props.notificationQueue, {
        batchSize: 10,
        reportBatchItemFailures: true,
      }),
    )
    props.usersTable.grantReadData(this.notificationProcessorLambda)
    props.workspacesTable.grantReadData(this.notificationProcessorLambda)

    // Slack commands: users read/write for account linking
    props.usersTable.grantReadWriteData(this.slackCommandsLambda)

    // Slack events: users read/write + workspaces read/write (token lookup + app_uninstalled)
    props.usersTable.grantReadWriteData(this.slackEventsLambda)
    props.workspacesTable.grantReadWriteData(this.slackEventsLambda)

    // OAuth: workspaces read/write for storing installation tokens
    props.workspacesTable.grantReadWriteData(this.slackOAuthLambda)
  }
}
