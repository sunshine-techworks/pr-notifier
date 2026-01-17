import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'

import type { UserDao } from '../interfaces/index'
import type { User } from '../types/index'
import { userSchema } from '../types/index'

/**
 * DynamoDB implementation of UserDao
 */
export class UserDaoImpl implements UserDao {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async create(user: User): Promise<User> {
    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `SLACK_USER#${user.slackUserId}`,
          SK: `SLACK_USER#${user.slackUserId}`,
          GSI1PK: `GITHUB#${user.githubUsername.toLowerCase()}`,
          GSI1SK: `GITHUB#${user.githubUsername.toLowerCase()}`,
          ...user,
        },
        // Ensure user doesn't already exist
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    )
    return user
  }

  async findById(slackUserId: string): Promise<User | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `SLACK_USER#${slackUserId}`,
          SK: `SLACK_USER#${slackUserId}`,
        },
      }),
    )
    return result.Item ? userSchema.parse(result.Item) : null
  }

  async update(slackUserId: string, data: Partial<User>): Promise<User> {
    // Build update expression dynamically based on provided data
    const updateExpressions: string[] = []
    const expressionAttributeNames: Record<string, string> = {}
    const expressionAttributeValues: Record<string, unknown> = {}

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && key !== 'slackUserId') {
        const attrName = `#${key}`
        const attrValue = `:${key}`
        updateExpressions.push(`${attrName} = ${attrValue}`)
        expressionAttributeNames[attrName] = key
        expressionAttributeValues[attrValue] = value
      }
    })

    // Handle GitHub username update (update GSI keys)
    if (data.githubUsername) {
      updateExpressions.push('GSI1PK = :gsi1pk', 'GSI1SK = :gsi1sk')
      expressionAttributeValues[':gsi1pk'] = `GITHUB#${data.githubUsername.toLowerCase()}`
      expressionAttributeValues[':gsi1sk'] = `GITHUB#${data.githubUsername.toLowerCase()}`
    }

    const result = await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: `SLACK_USER#${slackUserId}`,
          SK: `SLACK_USER#${slackUserId}`,
        },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      }),
    )
    // result.Attributes is guaranteed to exist with ReturnValues: 'ALL_NEW'
    return userSchema.parse(result.Attributes)
  }

  async delete(slackUserId: string): Promise<void> {
    await this.docClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: {
          PK: `SLACK_USER#${slackUserId}`,
          SK: `SLACK_USER#${slackUserId}`,
        },
      }),
    )
  }

  async findByGithubUsername(githubUsername: string): Promise<User | null> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `GITHUB#${githubUsername.toLowerCase()}`,
        },
        Limit: 1,
      }),
    )
    const item = result.Items?.[0]
    return item ? userSchema.parse(item) : null
  }

  async findByWorkspaceId(workspaceId: string): Promise<User[]> {
    // This would require a GSI on workspaceId
    // For now, using scan with filter (not ideal for production)
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `WORKSPACE#${workspaceId}`,
        },
      }),
    )
    return (result.Items ?? []).map((item) => userSchema.parse(item))
  }

  async countByWorkspaceId(workspaceId: string): Promise<number> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `WORKSPACE#${workspaceId}`,
        },
        Select: 'COUNT',
      }),
    )
    return result.Count ?? 0
  }
}
