import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'

import type { WorkspaceDao } from '../interfaces/index'
import type { Workspace } from '../types/index'
import { workspaceSchema } from '../types/index'

/**
 * DynamoDB implementation of WorkspaceDao
 */
export class WorkspaceDaoImpl implements WorkspaceDao {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async create(workspace: Workspace): Promise<Workspace> {
    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `WORKSPACE#${workspace.slackWorkspaceId}`,
          SK: `WORKSPACE#${workspace.slackWorkspaceId}`,
          ...workspace,
        },
        // Ensure workspace doesn't already exist
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    )
    return workspace
  }

  async findById(workspaceId: string): Promise<Workspace | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `WORKSPACE#${workspaceId}`,
          SK: `WORKSPACE#${workspaceId}`,
        },
      }),
    )
    return result.Item ? workspaceSchema.parse(result.Item) : null
  }

  async update(workspaceId: string, data: Partial<Workspace>): Promise<Workspace> {
    // Build update expression dynamically based on provided data
    const updateExpressions: string[] = []
    const expressionAttributeNames: Record<string, string> = {}
    const expressionAttributeValues: Record<string, unknown> = {}

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && key !== 'slackWorkspaceId') {
        const attrName = `#${key}`
        const attrValue = `:${key}`
        updateExpressions.push(`${attrName} = ${attrValue}`)
        expressionAttributeNames[attrName] = key
        expressionAttributeValues[attrValue] = value
      }
    })

    const result = await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: `WORKSPACE#${workspaceId}`,
          SK: `WORKSPACE#${workspaceId}`,
        },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      }),
    )
    // result.Attributes is guaranteed to exist with ReturnValues: 'ALL_NEW'
    return workspaceSchema.parse(result.Attributes)
  }

  async delete(workspaceId: string): Promise<void> {
    await this.docClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: {
          PK: `WORKSPACE#${workspaceId}`,
          SK: `WORKSPACE#${workspaceId}`,
        },
      }),
    )
  }
}
