import * as cdk from 'aws-cdk-lib'
import type { Construct } from 'constructs'

import { ApiConstruct } from '../constructs/api'
import { DatabaseConstruct } from '../constructs/database'
import { LambdasConstruct } from '../constructs/lambdas'
import { ObservabilityConstruct } from '../constructs/observability'
import { QueuesConstruct } from '../constructs/queues'

/**
 * Main CDK stack for PR Notify
 * Orchestrates all infrastructure constructs: Database, Queues, Lambdas, and API Gateway
 */
export class PrNotifyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // DynamoDB tables for users and workspaces
    const database = new DatabaseConstruct(this, 'Database')

    // SQS queues for notification processing with DLQ for reliability
    const queues = new QueuesConstruct(this, 'Queues')

    // Lambda functions for webhook processing, notifications, and Slack interactions
    const lambdas = new LambdasConstruct(this, 'Lambdas', {
      usersTable: database.usersTable,
      workspacesTable: database.workspacesTable,
      prThreadsTable: database.prThreadsTable,
      notificationQueue: queues.notificationQueue,
    })

    // API Gateway for GitHub webhooks and Slack interactions
    new ApiConstruct(this, 'Api', {
      webhookIngestLambda: lambdas.webhookIngestLambda,
      slackCommandsLambda: lambdas.slackCommandsLambda,
      slackEventsLambda: lambdas.slackEventsLambda,
      slackOAuthLambda: lambdas.slackOAuthLambda,
      githubOAuthLambda: lambdas.githubOAuthLambda,
    })

    // Observability: CloudWatch dashboard, alarms, and Slack DM alerts
    new ObservabilityConstruct(this, 'Observability', {
      webhookIngestLambda: lambdas.webhookIngestLambda,
      notificationProcessorLambda: lambdas.notificationProcessorLambda,
      slackCommandsLambda: lambdas.slackCommandsLambda,
      slackEventsLambda: lambdas.slackEventsLambda,
      slackOAuthLambda: lambdas.slackOAuthLambda,
      githubOAuthLambda: lambdas.githubOAuthLambda,
      deadLetterQueue: queues.deadLetterQueue,
      notificationQueue: queues.notificationQueue,
    })

    // Stack outputs for external reference
    new cdk.CfnOutput(this, 'UsersTableName', {
      value: database.usersTable.tableName,
      description: 'DynamoDB table for user data',
    })

    new cdk.CfnOutput(this, 'NotificationQueueUrl', {
      value: queues.notificationQueue.queueUrl,
      description: 'SQS queue URL for notification processing',
    })
  }
}
