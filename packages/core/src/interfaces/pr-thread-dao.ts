import type { PrThread } from '../types/index'

/**
 * Outcome of attempting to record a new PR thread.
 *
 * Concurrent SQS records for the same PR can both miss the lookup and both
 * try to create the parent record. The conditional write at the storage
 * layer guarantees only one wins; the loser receives `created: false` so
 * callers can emit observability for the resulting duplicate top-level DM.
 */
export interface PrThreadCreateResult {
  /** True when this caller's record was persisted; false when another writer won the race. */
  created: boolean
}

/**
 * Data access interface for PR thread tracking.
 *
 * Used by the notification processor to remember the parent Slack message
 * for each (slackUserId, repository, prNumber) so subsequent notifications
 * can be posted as thread replies.
 */
export interface PrThreadDao {
  findThread(
    slackUserId: string,
    repository: string,
    prNumber: number,
  ): Promise<PrThread | null>

  /**
   * Persists a new thread record using a conditional write that only
   * succeeds when no record exists. Callers should not call this when
   * `findThread` returned a record.
   */
  createThread(thread: PrThread): Promise<PrThreadCreateResult>
}
