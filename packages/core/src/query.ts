/* eslint-disable ts/no-use-before-define */

import type { FetchPolicy, Model, ModelDefaults, ModelType, QueryApi, ResolvedModelItem, ResolvedModelType, Store, WriteItem } from '@rstore/shared'
import { set } from '@rstore/shared'
import { defaultManyMarker } from './cache'

export const defaultFetchPolicy: FetchPolicy = 'cache-first'

export interface CreateQueryApiOptions<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
> {
  type: ResolvedModelType<TModelType, TModelDefaults>
  store: Store<TModel, TModelDefaults>
}

export function createQueryApi<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
>(
  {
    store,
    type,
  }: CreateQueryApiOptions<TModelType, TModelDefaults, TModel>,
): QueryApi<TModelType, TModelDefaults, TModel> {
  // Peek first item in the cache
  const peekFirst: QueryApi<TModelType, TModelDefaults, TModel>['peekFirst'] = (keyOrOptions) => {
    const key = typeof keyOrOptions === 'string' ? keyOrOptions : keyOrOptions?.key
    const findOptions = typeof keyOrOptions === 'string' ? {} : keyOrOptions
    const fetchPolicy = store.getFetchPolicy(findOptions?.fetchPolicy)

    if (shouldReadCacheFromFetchPolicy(fetchPolicy)) {
      let result: any

      if (key) {
        result = store.cache.readItem(type, key)
      }
      else if (typeof findOptions?.filter === 'function') {
        result = peekMany(findOptions)
      }

      store.hooks.callHookSync('cacheFilterFirst', {
        store,
        type,
        getResult: () => result,
        setResult: (value) => {
          result = value
        },
        key,
        findOptions,
      })
      return result
    }
    else {
      return []
    }
  }

  const findFirst: QueryApi<TModelType, TModelDefaults, TModel>['findFirst'] = async (keyOrOptions) => {
    const key = typeof keyOrOptions === 'string' ? keyOrOptions : keyOrOptions?.key
    const findOptions = typeof keyOrOptions === 'string' ? {} : keyOrOptions
    const fetchPolicy = store.getFetchPolicy(findOptions?.fetchPolicy)

    let result: any

    if (shouldReadCacheFromFetchPolicy(fetchPolicy)) {
      result = peekFirst({
        ...findOptions,
        key,
      })
    }

    if (!result && shouldFetchDataFromFetchPolicy(fetchPolicy)) {
      await store.hooks.callHook('fetchFirst', {
        store,
        type,
        key,
        findOptions,
        getResult: () => result,
        setResult: (value) => {
          result = value
        },
      })

      if (result) {
        parseItem(result)
      }

      if (fetchPolicy !== 'no-cache') {
        const key = type.key(result)
        if (!key) {
          console.warn(`Key is undefined for ${type.name}. Item was not written to cache.`)
        }
        else {
          store.cache.writeItem(type, key, result)
        }
      }
    }

    return result
  }

  const peekMany: QueryApi<TModelType, TModelDefaults, TModel>['peekMany'] = (findOptions) => {
    const fetchPolicy = store.getFetchPolicy(findOptions?.fetchPolicy)
    if (fetchPolicy === 'no-cache') {
      return []
    }
    else {
      let marker = defaultManyMarker(type, findOptions)

      store.hooks.callHookSync('beforeCacheReadMany', {
        store,
        type,
        findOptions,
        setMarker: (value) => {
          marker = value
        },
      })

      let result = store.cache.readItems(type, marker)

      if (typeof findOptions?.filter === 'function') {
        const filterFn = findOptions.filter
        result = result.filter(item => filterFn(item))
      }

      store.hooks.callHookSync('cacheFilterMany', {
        store,
        type,
        findOptions,
        getResult: () => result,
        setResult: (value) => {
          result = value
        },
      })
      return result
    }
  }

  const findMany: QueryApi<TModelType, TModelDefaults, TModel>['findMany'] = async (findOptions) => {
    const fetchPolicy = store.getFetchPolicy(findOptions?.fetchPolicy)

    let result: any

    if (shouldReadCacheFromFetchPolicy(fetchPolicy)) {
      result = peekMany(findOptions)
    }

    if (!result?.length && shouldFetchDataFromFetchPolicy(fetchPolicy)) {
      let marker = defaultManyMarker(type, findOptions)

      await store.hooks.callHook('fetchMany', {
        store,
        type,
        findOptions,
        getResult: () => result,
        setResult: (value) => {
          result = value
        },
        setMarker: (value) => {
          marker = value
        },
      })

      if (result) {
        for (const item of result) {
          parseItem(item)
        }
      }

      if (fetchPolicy !== 'no-cache') {
        const items = result
        const writes: Array<WriteItem<TModelType, TModelDefaults, TModel>> = []
        for (const item of items) {
          const key = type.key(item)
          if (!key) {
            console.warn(`Key is undefined for ${type.name}. Item was not written to cache.`)
            continue
          }
          writes.push({ key, value: item })
        }
        store.cache.writeItems<TModelType>(type, writes, marker)
      }
    }

    return result
  }

  function parseItem(item: any) {
    store.hooks.callHookSync('parseItem', {
      store,
      type,
      item,
      modifyItem: (path, value) => {
        set(item, path, value)
      },
    })
  }

  return {
    peekFirst,
    findFirst,
    peekMany,
    findMany,
  }
}

export function shouldReadCacheFromFetchPolicy(fetchPolicy: FetchPolicy | null | undefined) {
  return fetchPolicy === 'cache-and-fetch' || fetchPolicy === 'cache-first' || fetchPolicy === 'cache-only'
}

export function shouldFetchDataFromFetchPolicy(fetchPolicy: FetchPolicy | null | undefined) {
  return fetchPolicy === 'cache-and-fetch' || fetchPolicy === 'cache-first' || fetchPolicy === 'no-cache'
}
