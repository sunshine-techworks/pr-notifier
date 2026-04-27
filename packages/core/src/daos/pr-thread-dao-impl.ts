import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'

import type { PrThreadCreateResult, PrThreadDao } from '../interfaces/pr-thread-dao'
import type { PrThread } from '../types/index'
import { prThreadSchema } from '../types/index'

/**
 * 30 day window before a thread record is auto-deleted by DynamoDB TTL.
 * Once expired, the next notification for the PR starts a fresh top-level DM.
 */
const THREAD_TTL_SECONDS = 30 * 24 * 60 * 60

/**
 * DynamoDB implementation of PrThreadDao.
 *
 * Single-table layout:
 *   PK: SLACK_USER#{slackUserId}
 *   SK: PR#{repository}#{prNumber}
 *
 * Records carry a `ttl` epoch-seconds attribute consumed by DynamoDB's
 * native TTL feature for automatic cleanup; `ttl` is intentionally
 * absent from `prThreadSchema` because callers do not need it.
 */
export class PrThreadDaoImpl implements PrThreadDao {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async findThread(
    slackUserId: string,
    repository: string,
    prNumber: number,
  ): Promise<PrThread | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: prThreadPk(slackUserId),
          SK: prThreadSk(repository, prNumber),
        },
      }),
    )
    return result.Item ? prThreadSchema.parse(result.Item) : null
  }

  async createThread(thread: PrThread): Promise<PrThreadCreateResult> {
    // Conditional write: only persist when no record exists for this key.
    // The loser of a race surfaces as ConditionalCheckFailedException so the
    // caller can record a metric for the duplicate top-level message.
    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            PK: prThreadPk(thread.slackUserId),
            SK: prThreadSk(thread.repository, thread.prNumber),
            ttl: Math.floor(Date.now() / 1000) + THREAD_TTL_SECONDS,
            ...thread,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      )
      return { created: true }
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        return { created: false }
      }
      throw error
    }
  }
}

function prThreadPk(slackUserId: string): string {
  return `SLACK_USER#${slackUserId}`
}

function prThreadSk(repository: string, prNumber: number): string {
  return `PR#${repository}#${prNumber}`
}
