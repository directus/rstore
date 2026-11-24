import type { CacheScope, FindManyOptions } from '@rstore/shared'

/** The connector could not verify or publish a complete indexed partition. */
export class IncompleteCacheScopeError extends Error {
  /** Identify the requested partition without logging its content. */
  constructor(scope: CacheScope) {
    super(`Incomplete cache scope: ${scope.field}`)
    this.name = 'IncompleteCacheScopeError'
  }
}

/** Reject combinations that cannot represent the requested complete partition. */
export function validateCompleteScope(options: FindManyOptions<any, any, any>): void {
  const scope = options.cacheScope
  if (!scope)
    return
  if (!scope.field || (typeof scope.value !== 'string' && !Number.isFinite(scope.value)))
    throw new TypeError('cacheScope requires an indexed field and a string or finite number value')
  if (options.pageIndex != null || options.pageSize != null || options.resultMode === 'responseRefs' || options.fetchPolicy === 'no-cache')
    throw new TypeError('cacheScope requires an unpaginated computed cached query')
}
