import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources'
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as sqs from 'aws-cdk-lib/aws-sqs'
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
 * Lambdas construct for PR Notify
 * Creates all Lambda functions with proper bundling and permissions
 */
export class LambdasConstruct extends cdk.NestedStack {
  public readonly webhookIngestLambda: lambda.Function
  public readonly notificationProcessorLambda: lambda.Function
  public readonly slackCommandsLambda: lambda.Function
  public readonly slackEventsLambda: lambda.Function

  constructor(scope: Construct, id: string, props: LambdasConstructProps) {
    super(scope, id)

    // Shared Lambda configuration
    const sharedConfig = {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      // Environment variables available to all Lambdas
      // Secrets should be stored in SSM Parameter Store or Secrets Manager
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        USERS_TABLE_NAME: props.usersTable.tableName,
        WORKSPACES_TABLE_NAME: props.workspacesTable.tableName,
        NOTIFICATION_QUEUE_URL: props.notificationQueue.queueUrl,
      },
    }

    // Path to lambdas package source
    const lambdasPath = join(__dirname, '../../../lambdas/src')

    // esbuild bundling configuration for ESM modules
    const bundlingConfig = {
      minify: true,
      sourceMap: true,
      target: 'node22',
      format: lambdaNodejs.OutputFormat.ESM,
      // Mark AWS SDK as external since Lambda runtime provides it
      externalModules: ['@aws-sdk/*'],
      // Enable tree-shaking for smaller bundles
      mainFields: ['module', 'main'],
    }

    // Webhook Ingest Lambda
    // Receives GitHub webhooks, validates signatures, and queues notifications
    this.webhookIngestLambda = new lambdaNodejs.NodejsFunction(this, 'WebhookIngestLambda', {
      ...sharedConfig,
      functionName: 'pr-notify-webhook-ingest',
      entry: join(lambdasPath, 'webhook-ingest/handler.ts'),
      handler: 'handler',
      bundling: bundlingConfig,
      description: 'Ingests GitHub webhooks and queues notifications',
    })

    // Notification Processor Lambda
    // Consumes from SQS queue and sends Slack DMs
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

    // Slack Commands Lambda
    // Handles /pr-notify slash commands
    this.slackCommandsLambda = new lambdaNodejs.NodejsFunction(this, 'SlackCommandsLambda', {
      ...sharedConfig,
      functionName: 'pr-notify-slack-commands',
      entry: join(lambdasPath, 'slack-commands/handler.ts'),
      handler: 'handler',
      bundling: bundlingConfig,
      description: 'Handles Slack slash commands for PR Notify',
    })

    // Slack Events Lambda
    // Handles app_home_opened, block_actions, etc.
    this.slackEventsLambda = new lambdaNodejs.NodejsFunction(this, 'SlackEventsLambda', {
      ...sharedConfig,
      functionName: 'pr-notify-slack-events',
      entry: join(lambdasPath, 'slack-events/handler.ts'),
      handler: 'handler',
      bundling: bundlingConfig,
      description: 'Handles Slack Events API callbacks',
    })

    // Grant permissions

    // Webhook ingest needs to write to the notification queue
    props.notificationQueue.grantSendMessages(this.webhookIngestLambda)
    // Also needs to read users table to find notification targets
    props.usersTable.grantReadData(this.webhookIngestLambda)

    // Notification processor consumes from the queue
    this.notificationProcessorLambda.addEventSource(
      new lambdaEventSources.SqsEventSource(props.notificationQueue, {
        batchSize: 10,
        // Enable partial batch response for better error handling
        reportBatchItemFailures: true,
      }),
    )
    // Needs read access to users for notification preferences
    props.usersTable.grantReadData(this.notificationProcessorLambda)
    props.workspacesTable.grantReadData(this.notificationProcessorLambda)

    // Slack commands needs read/write to users for linking accounts
    props.usersTable.grantReadWriteData(this.slackCommandsLambda)

    // Slack events needs read/write to users for preferences and unlinking
    props.usersTable.grantReadWriteData(this.slackEventsLambda)
  }
}
