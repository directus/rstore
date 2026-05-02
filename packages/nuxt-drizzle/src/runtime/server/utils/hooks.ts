import type { Awaitable } from '@rstore/shared'
import type { Peer } from 'crossws'
import type { InferSelectModel, Table, TableConfig } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { QueryObject } from 'ufo'
import type { RstoreDrizzleRealtimePayload } from '../../utils/realtime'
import { createHooks } from './hookable'
import { getDrizzleCollectionNameFromTable } from './index'

export type { RstoreDrizzleRealtimePayload } from '../../utils/realtime'

export interface RstoreDrizzleMeta {
}

export interface RstoreDrizzleHookPayload {
  /**
   * H3 event object.
   */
  event: H3Event
  /**
   * Collection name as received from the request.
   */
  collection: string
  /**
   * Meta object that can be used to pass information between hooks.
   */
  meta: RstoreDrizzleMeta
  /**
   * Request body, if any.
   */
  body?: any
  /**
   * Route parameters as received from the request.
   */
  params?: Record<string, string>
  /**
   * Query parameters as received from the request.
   */
  query?: QueryObject
}

export interface RstoreDrizzleQueryBuilder {
  where: (condition: any) => void
  extras: (extras: Record<string, any>) => void
}

export type RstoreDrizzleTransformQuery = (queryBuilder: RstoreDrizzleQueryBuilder) => void

export interface RstoreDrizzleBeforeHookPayload extends RstoreDrizzleHookPayload {
  /**
   * Allows to transform the query before execution (for example to add where clauses).
   */
  transformQuery: (transform: RstoreDrizzleTransformQuery) => void
}

export interface RstoreDrizzleAfterHookPayload<TResult> extends RstoreDrizzleHookPayload {
  result: TResult
  setResult: (result: TResult) => void
}

export interface RstoreDrizzleItemBeforeHookPayload extends RstoreDrizzleBeforeHookPayload {
  key: string
}

export interface RstoreDrizzleItemAfterHookPayload<TResult> extends RstoreDrizzleAfterHookPayload<TResult> {
  key: string
}

/**
 * Invoked **for every update frame** that matched at least one of the
 * peer's active subscriptions, just before the frame is forwarded to
 * the client. Call `reject()` to suppress the frame for this peer.
 *
 * Because this runs per-message, it is the right place for permission
 * checks that depend on mutable state (current role, ACL membership,
 * row-level visibility tied to the session). Use `realtime.authorize`
 * for one-shot subscription gating only.
 */
export interface RstoreDrizzleRealtimeFilterPayload<TResult> extends RstoreDrizzleRealtimePayload<TResult> {
  peer: Peer
  reject: () => void
}

/**
 * Invoked **once** when a client sends a `subscribe` frame. Handlers may
 * call `reject()` to refuse the subscription — the server then responds
 * with a `{ subscription: { action: 'rejected', ... } }` frame and does
 * NOT record the subscription.
 *
 * **Scope**: This hook runs at subscribe time only. If the caller's
 * permissions can change while a subscription is active (e.g. role
 * revoked, session expired), `realtime.authorize` will NOT be re-run —
 * the existing subscription keeps streaming. To re-evaluate authorization
 * on every update, do the check inside `realtime.filter` instead, and/or
 * close the peer (`peer.close()`) when the session is invalidated.
 */
export interface RstoreDrizzleRealtimeAuthorizePayload {
  peer: Peer
  /**
   * Collection name being subscribed to. Mirrors `subscription.collection`
   * so `hooksForTable` can filter authorize handlers uniformly.
   */
  collection: string
  subscription: import('../../utils/realtime').SubscriptionMessage
  meta: RstoreDrizzleMeta
  reject: (reason?: string) => void
}

export interface RstoreDrizzleHooks<
  TResult = any,
> {
  'index.get.before': (payload: RstoreDrizzleBeforeHookPayload) => Awaitable<void>
  'index.get.after': (payload: RstoreDrizzleAfterHookPayload<Array<TResult>>) => Awaitable<void>
  'index.post.before': (payload: RstoreDrizzleBeforeHookPayload) => Awaitable<void>
  'index.post.after': (payload: RstoreDrizzleAfterHookPayload<TResult>) => Awaitable<void>
  'item.get.before': (payload: RstoreDrizzleItemBeforeHookPayload) => Awaitable<void>
  'item.get.after': (payload: RstoreDrizzleItemAfterHookPayload<TResult>) => Awaitable<void>
  'item.patch.before': (payload: RstoreDrizzleItemBeforeHookPayload) => Awaitable<void>
  'item.patch.after': (payload: RstoreDrizzleItemAfterHookPayload<TResult>) => Awaitable<void>
  'item.delete.before': (payload: RstoreDrizzleItemBeforeHookPayload) => Awaitable<void>
  'item.delete.after': (payload: RstoreDrizzleItemAfterHookPayload<TResult>) => Awaitable<void>
  'realtime.filter': (payload: RstoreDrizzleRealtimeFilterPayload<TResult>) => Awaitable<void>
  'realtime.authorize': (payload: RstoreDrizzleRealtimeAuthorizePayload) => Awaitable<void>
}

export const rstoreDrizzleHooks = createHooks<RstoreDrizzleHooks>()

export function hooksForTable<TTableConfig extends TableConfig, TTable extends Table<TTableConfig>>(table: TTable, hooks: Partial<RstoreDrizzleHooks<InferSelectModel<TTable, TTableConfig & { dbColumnNames: false }>>>) {
  const collectionName = getDrizzleCollectionNameFromTable(table)

  for (const hookName in hooks) {
    const hookFn = hooks[hookName as keyof typeof hooks]!
    rstoreDrizzleHooks.hook(hookName as keyof RstoreDrizzleHooks, async (payload: Parameters<typeof hookFn>[0]) => {
      if (payload.collection === collectionName) {
        await hookFn(payload as any)
      }
    })
  }
}

let allowedCollections: Set<string> | null = null

export function allowTables(tables: Table[]) {
  const collectionNames = tables.map(getDrizzleCollectionNameFromTable)

  if (!allowedCollections) {
    allowedCollections = new Set(collectionNames)

    for (const hookName of ['index.get.before', 'index.post.before', 'item.get.before', 'item.patch.before', 'item.delete.before'] as (keyof RstoreDrizzleHooks)[]) {
      rstoreDrizzleHooks.hook(hookName, async (payload: RstoreDrizzleBeforeHookPayload) => {
        if (!allowedCollections!.has(payload.collection)) {
          throw new Error(`Collection "${payload.collection}" is not allowed.`)
        }
      })
    }
  }
  else {
    for (const name of collectionNames) {
      allowedCollections.add(name)
    }
  }
}
