import type { Collection, CollectionDefaults, ResolvedCollection, StoreSchema } from '../collection'
import type { FieldTimestamps, FieldTimestampValue } from '../crdt'
import type { GlobalStoreType } from '../global'
import type { FindOptions, QueryRefreshOptions } from '../query'
import type { Awaitable } from '../utils'
import type { CustomHookMeta, PublicHookMeta } from './meta'

/**
 * Outcome of publishing a server-computed live page result.
 *
 * - `'applied'`: the push was accepted, not necessarily displayed. The main
 *   page publishes it before `setResult` returns. Any other page queues it
 *   until the main page has a result; a queued push is still dropped, without
 *   effects, if before publishing the query is disposed or disabled, the page
 *   is removed or its options change, a later unversioned push supersedes it
 *   (as does, for an unversioned push, a new fetch of the page), or a newer
 *   version lands.
 * - `'stale'`: rejected without effects, because the page already shows or has
 *   accepted a newer `version`.
 * - `'inactive'`: rejected without effects, because the subscription no longer
 *   owns its page.
 */
export type SetResultOutcome = 'applied' | 'stale' | 'inactive'

/** Metadata accompanying a live page result; accepted rows are parsed and written. */
export interface SetResultOptions {
  /** Shared field stamps, or index-aligned per-row stamps with the same length as the rows. */
  fieldTimestamps?: FieldTimestamps | Array<FieldTimestamps | undefined>
  /**
   * Hook metadata merged into the query metadata, such as `totalCount`.
   * `$`-prefixed fields are private to rstore and excluded; pass the snapshot
   * version as `version`.
   */
  meta?: PublicHookMeta
  /** Server snapshot version, compared with the followed page's applied result. */
  version?: FieldTimestampValue
}

/** Clone accepted raw rows and stamps, then parse, write and publish without fetching. */
export type SetSubscriptionResult = (result: unknown, options?: SetResultOptions) => SetResultOutcome

/** Server termination of one live page subscription. */
export interface EndSubscriptionOptions {
  /** Connector diagnostic explaining why the server stopped following. */
  reason?: unknown
  /** Reopen with bounded backoff, renewed by accepted results; false leaves the page ended. */
  retry: boolean
}

/** Invalidate this subscription's callbacks and recover its followed page. */
export type EndSubscription = (options: EndSubscriptionOptions) => void

/**
 * Subscription hooks.
 */
export interface RealtimeHookDefinitions<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
> {
  subscribe: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      /** The subscription ID used for unsubscribe. */
      subscriptionId: string
      /** Publishes the followed page of a live query; absent for plain subscriptions. */
      setResult?: SetSubscriptionResult
      /** Reports server termination; absent for plain subscriptions. */
      end?: EndSubscription
      /** Followed page index; absent for keyed and unpaged live queries. */
      pageIndex?: number
      /** Target item key for keyed plain subscriptions and live queries. */
      key?: string | number
      /** Base and page identity options after defaults and resolveFindOptions hooks. */
      findOptions: FindOptions<TCollection, TCollectionDefaults, TSchema>
      /**
       * Refetches the followed page of this live query. Only set for live queries.
       *
       * For realtime connectors whose pushed data can't be written into the cache as-is, e.g.
       * when items left the query result without being deleted. Pass
       * `{ resultMode: 'responseRefs' }` to replace result membership with the
       * server response while retaining rows in the shared cache. Without options,
       * the query keeps its normal refresh behavior, which can retain cached rows.
       * Options shape the page's loads only; this subscription keeps its `findOptions`.
       */
      refresh?: (options?: QueryRefreshOptions<FindOptions<TCollection, TCollectionDefaults, TSchema>>) => Promise<unknown>
    },
  ) => Awaitable<void>

  unsubscribe: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      subscriptionId: string
      /** Item key used when opening this subscription. */
      key?: string | number
      /** Resolved options retained from opening this subscription. */
      findOptions: FindOptions<TCollection, TCollectionDefaults, TSchema>
    },
  ) => Awaitable<void>
}
