import type { Awaitable } from '@rstore/shared'
import type { H3Event } from 'h3'
import type { QueryObject } from 'ufo'
import { createHooks } from 'hookable'

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

export interface RstoreDrizzleHooks<
  TResult = any,
> {
  'index.get.before': (payload: RstoreDrizzleBeforeHookPayload) => Awaitable<void>
  'index.get.after': (payload: RstoreDrizzleAfterHookPayload<TResult>) => Awaitable<void>
  'index.post.before': (payload: RstoreDrizzleBeforeHookPayload) => Awaitable<void>
  'index.post.after': (payload: RstoreDrizzleAfterHookPayload<TResult>) => Awaitable<void>
  'item.get.before': (payload: RstoreDrizzleBeforeHookPayload) => Awaitable<void>
  'item.get.after': (payload: RstoreDrizzleAfterHookPayload<TResult>) => Awaitable<void>
  'item.patch.before': (payload: RstoreDrizzleBeforeHookPayload) => Awaitable<void>
  'item.patch.after': (payload: RstoreDrizzleAfterHookPayload<TResult>) => Awaitable<void>
  'item.delete.before': (payload: RstoreDrizzleBeforeHookPayload) => Awaitable<void>
  'item.delete.after': (payload: RstoreDrizzleAfterHookPayload<TResult>) => Awaitable<void>
}

export const rstoreDrizzleHooks = createHooks<RstoreDrizzleHooks>()
