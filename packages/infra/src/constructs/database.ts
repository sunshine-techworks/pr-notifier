import * as cdk from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import type { Construct } from 'constructs'

/**
 * Database construct for PR Notify
 * Creates DynamoDB tables with single-table design patterns
 */
export class DatabaseConstruct extends cdk.NestedStack {
  public readonly usersTable: dynamodb.Table
  public readonly workspacesTable: dynamodb.Table

  constructor(scope: Construct, id: string) {
    super(scope, id)

    // Users table with GSIs for efficient lookups by different access patterns
    // Primary key: slackUserId (partition key)
    // GSI1: githubUsername for reverse lookups from GitHub webhooks
    // GSI2: workspaceId for listing users in a workspace
    this.usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: 'pr-notify-users',
      partitionKey: {
        name: 'slackUserId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // Enable point-in-time recovery for data protection
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    // GSI for looking up users by their GitHub username
    // Used when processing webhooks to find the Slack user to notify
    this.usersTable.addGlobalSecondaryIndex({
      indexName: 'gsi-github-username',
      partitionKey: {
        name: 'githubUsername',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    })

    // GSI for listing all users in a workspace
    // Used for workspace-level operations and billing/limits
    this.usersTable.addGlobalSecondaryIndex({
      indexName: 'gsi-workspace-id',
      partitionKey: {
        name: 'workspaceId',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    })

    // Workspaces table for Slack workspace configuration
    // Stores installation data, bot tokens, and workspace-level settings
    this.workspacesTable = new dynamodb.Table(this, 'WorkspacesTable', {
      tableName: 'pr-notify-workspaces',
      partitionKey: {
        name: 'workspaceId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })
  }
}
