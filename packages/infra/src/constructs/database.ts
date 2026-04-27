import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import type { Construct } from 'constructs'

/**
 * Database construct for PR Notify.
 * Uses single-table design with composite keys (PK/SK) and GSIs
 */
export class DatabaseConstruct extends cdk.NestedStack {
  public readonly usersTable: dynamodb.Table
  public readonly workspacesTable: dynamodb.Table
  public readonly prThreadsTable: dynamodb.Table

  constructor(scope: Construct, id: string) {
    super(scope, id)

    // Users table using single-table design with composite keys.
    // PK: SLACK_USER#{slackUserId}, SK: SLACK_USER#{slackUserId}
    // GSI1: GITHUB#{githubUsername} for reverse lookups from webhooks
    // GSI2: WORKSPACE#{workspaceId} for listing users per workspace
    this.usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: 'pr-notify-users',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    // GSI1: Look up users by GitHub username (used by WebhookProcessor
    // to find the Slack user to notify from a GitHub webhook event)
    this.usersTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: {
        name: 'GSI1PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI1SK',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    })

    // GSI2: List users by workspace (used for workspace-level
    // operations, user counts, and billing/limits)
    this.usersTable.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: {
        name: 'GSI2PK',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    })

    // Workspaces table using single-table design with composite keys.
    // PK: WORKSPACE#{slackWorkspaceId}, SK: WORKSPACE#{slackWorkspaceId}
    // Stores installation data, bot tokens, and workspace-level settings.
    this.workspacesTable = new dynamodb.Table(this, 'WorkspacesTable', {
      tableName: 'pr-notify-workspaces',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    // PR threads table tracks the parent Slack message for each
    // (slackUserId, repository, prNumber) so subsequent notifications
    // for the same PR are posted as threaded replies. Records auto-expire
    // via DynamoDB TTL on the `ttl` attribute (epoch seconds).
    // PITR is skipped intentionally -- this data is ephemeral, has no
    // business recovery value, and saves on storage cost.
    this.prThreadsTable = new dynamodb.Table(this, 'PrThreadsTable', {
      tableName: 'pr-notify-pr-threads',
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })
  }
}
