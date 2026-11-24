import type { Collection, CollectionDefaults, CompleteScopeResult, CustomHookMeta, FindManyOptions, FindOptions, GlobalStoreType, QueryResult, ResolvedCollection, StoreCore, StoreSchema, WrappedItem } from '@rstore/shared'
import { defaultMarker } from '../cache'
import { shouldFetchDataFromFetchPolicy, shouldReadCacheFromFetchPolicy } from '../fetchPolicy'
import { stringifyFindOptions } from '../utils/findOptions'
import { createOperationErrorReporter } from '../utils/operationError'
import { IncompleteCacheScopeError, validateCompleteScope } from './completeScope'
import { dedupeQuery } from './dedupe'
import { peekMany } from './peekMany'
import { processQueryResult, wrapQueryResult } from './processResult'

export interface FindManyParams<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  store: StoreCore<TSchema, TCollectionDefaults>
  meta?: CustomHookMeta
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
  findOptions?: FindManyOptions<TCollection, TCollectionDefaults, TSchema>
}

/**
 * Find all items that match the query.
 */
export async function findMany<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>({
  store,
  meta,
  collection,
  findOptions,
}: FindManyParams<TCollection, TCollectionDefaults, TSchema>): Promise<QueryResult<Array<WrappedItem<TCollection, TCollectionDefaults, TSchema>>>> {
  meta ??= findOptions?.meta ?? {}
  findOptions = store.$resolveFindOptions(collection, findOptions ?? {}, true, meta)
  if (findOptions.dedupe === false) {
    return _findMany({
      store,
      meta,
      collection,
      findOptions,
    })
  }

  // Function-aware serialization: queries that differ only by a function
  // option (e.g. `filter`) must not share the same in-flight promise
  const dedupeKey = stringifyFindOptions(findOptions)
  return dedupeQuery(store.$dedupePromises, `findMany:${collection.name}:${dedupeKey}`, meta, meta => _findMany({
    store,
    meta,
    collection,
    findOptions,
  }))
}

/** Execute multiple items query with one terminal failure observation. */
async function _findMany<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>({
  store,
  meta,
  collection,
  findOptions,
}: FindManyParams<TCollection, TCollectionDefaults, TSchema> & { findOptions: FindManyOptions<TCollection, TCollectionDefaults, TSchema>, meta: CustomHookMeta }): Promise<QueryResult<Array<WrappedItem<TCollection, TCollectionDefaults, TSchema>>>> {
  const operation = {}
  const reportError = createOperationErrorReporter(store.$hooks, 'fetchError', {
    operation,
    store: store as unknown as GlobalStoreType,
    meta,
    collection,
    findOptions,
    many: true,
  })
  try {
    validateCompleteScope(findOptions)
    const fetchPolicy = findOptions.fetchPolicy
    const scope = findOptions.cacheScope
    const cacheComplete = scope && store.$cache.scopes?.isComplete(collection, scope)
    if (scope && !store.$cache.scopes)
      throw new IncompleteCacheScopeError(scope)

    let result: any[] | undefined
    let marker: string | undefined
    let fetchPromise: Promise<void> | undefined

    if (shouldReadCacheFromFetchPolicy(fetchPolicy)) {
      const peekManyResult = peekMany({
        store,
        meta,
        collection,
        findOptions,
      })
      result = peekManyResult.result
      marker = peekManyResult.marker
    }

    const shouldFetch = scope ? !cacheComplete || fetchPolicy !== 'cache-first' : !result?.length
    if (shouldFetch && shouldFetchDataFromFetchPolicy(fetchPolicy)) {
      const fetch = async () => {
        const request = scope && store.$cache.scopes?.begin(collection, scope)
        let scopeResult: CompleteScopeResult | undefined
        try {
          if (!marker) {
            marker = defaultMarker(collection, findOptions)
          }

          await store.$hooks.callHook('beforeFetch', {
            operation,
            store: store as unknown as GlobalStoreType,
            meta,
            collection,
            findOptions,
            many: true,
            updateFindOptions: (value) => {
              Object.assign(findOptions, value)
            },
          })

          const abort = store.$hooks.withAbort({ explicit: true })
          await store.$hooks.callHook('fetchMany', {
            store: store as unknown as GlobalStoreType,
            meta,
            collection,
            findOptions,
            getResult: () => result ?? [],
            setResult: (value, options) => {
              result = value
              scopeResult = options
              if ((result?.length || options?.completeScope) && options?.abort !== false) {
                abort()
              }
            },
            setMarker: (value) => {
              marker = value
            },
            abort,
          }, abort)

          await store.$hooks.callHook('afterFetch', {
            operation,
            store: store as unknown as GlobalStoreType,
            meta,
            collection,
            findOptions,
            many: true,
            getResult: () => result,
            setResult: (value) => {
              result = value
            },
          })

          if (!scope || !request) {
            result = processQueryResult({ store, collection, result, many: true, findOptions, meta, marker })
            return
          }
          if (scopeResult?.completeScope?.field !== scope.field || scopeResult.completeScope.value !== scope.value || !Array.isArray(result))
            throw new IncompleteCacheScopeError(scope)
          const rows = processQueryResult({ store, collection, result, many: true, findOptions: { ...findOptions, fetchPolicy: 'no-cache' }, meta })
          const accepted = await request.replace(rows.map((value: any) => ({ key: collection.getKey(value), value })), {
            revision: scopeResult.revision,
            canPublish: meta.$canPublishQuery,
          })
          if (!accepted)
            throw new IncompleteCacheScopeError(scope)
          result = rows
        }
        catch (error) {
          reportError(error)
          throw error
        }
        finally {
          request?.release()
        }
      }

      fetchPromise = fetch()

      if (fetchPolicy !== 'cache-and-fetch') {
        await fetchPromise
      }
      else {
        // Background fetch: callers may observe `fetchPromise` but are not required to.
        // Attaching a handler marks the rejection as handled so an ignored failure doesn't
        // become an unhandled rejection - the returned promise still rejects when awaited.
        fetchPromise.catch(() => {})
      }
    }
    else if (meta.$queryTracking) {
      meta.$queryTracking.skipped = true
    }

    if (findOptions.include && shouldFetchDataFromFetchPolicy(fetchPolicy) && meta.$canPublishQuery?.() !== false) {
      const abort = store.$hooks.withAbort({ explicit: true })
      await store.$hooks.callHook('fetchRelations', {
        store: store as unknown as GlobalStoreType,
        meta,
        collection,
        findOptions: findOptions as FindOptions<TCollection, TCollectionDefaults, TSchema> & { include: NonNullable<FindOptions<TCollection, TCollectionDefaults, TSchema>['include']> },
        many: true,
        getResult: () => result,
        abort,
      }, abort)
    }

    result = wrapQueryResult({ store, collection, result, many: true, noCache: fetchPolicy === 'no-cache' || meta.$canPublishQuery?.() === false })

    return {
      result: result ?? [],
      marker,
      fetchPromise,
    }
  }
  catch (error) {
    reportError(error)
    throw error
  }
}
