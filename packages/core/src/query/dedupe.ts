import type { CustomHookMeta, QueryResult } from '@rstore/shared'
import { pickNonSpecialProps } from '@rstore/shared'

/** Consumers sharing the publication decision of one pending fetch. */
interface QueryConsumers {
  /** Response metadata written by the hooks handling the shared request. */
  meta: CustomHookMeta
  /** Undefined means an imperative consumer, which always accepts the result. */
  checks: Set<CustomHookMeta['$canPublishQuery']>
  /** Combined check installed on the request metadata. */
  canPublish: () => boolean
}

/** Weak ownership keeps completed requests from retaining their consumers. */
const consumers = new WeakMap<Promise<unknown>, QueryConsumers>()

/**
 * Share a fetch without tying its cache writes to only the first consumer.
 * A superseded query may stop publishing while another query, or an imperative
 * caller, still needs the response. Entries disappear with their promises.
 */
export function dedupeQuery<TResult extends QueryResult<unknown>>(
  promises: Map<string, Promise<any>>,
  key: string,
  meta: CustomHookMeta,
  fetch: (meta: CustomHookMeta) => Promise<TResult>,
): Promise<TResult> {
  const pending = promises.get(key)
  if (pending) {
    const group = consumers.get(pending)
    // Forwarding the same metadata must not make its combined check recursive.
    if (group && meta.$canPublishQuery !== group.canPublish) {
      group.checks.add(meta.$canPublishQuery)
    }
    return group && group.meta !== meta ? shareQueryMetadata(pending, group.meta, meta) : pending
  }
  const checks = new Set([meta.$canPublishQuery] as Array<CustomHookMeta['$canPublishQuery']>)
  const canPublish = () => [...checks].some(check => !check || check())
  // Preserve the metadata object: plugins publish response metadata into it.
  if (meta.$canPublishQuery) {
    meta.$canPublishQuery = canPublish
  }
  const promise = fetch(meta)
  promises.set(key, promise)
  consumers.set(promise, { meta, checks, canPublish })
  // A background query returns its cached result before the request finishes.
  // Keep that immediately available result shared until its fetch also settles.
  promise.then((result) => {
    if (result.fetchPromise) {
      result.fetchPromise.then(release, release)
    }
    else {
      release()
    }
  }, release)
  return promise

  /** Release this request before callers retry or read the newly populated cache. */
  function release(): void {
    if (promises.get(key) === promise) {
      promises.delete(key)
    }
  }
}

/** Share hook results without copying another consumer's private tracking state. */
async function shareQueryMetadata<TResult extends QueryResult<unknown>>(
  pending: Promise<TResult>,
  source: CustomHookMeta,
  target: CustomHookMeta,
): Promise<TResult> {
  /** Copy ordinary response fields; publication guards and ownership stay local. */
  function publish(): void {
    Object.assign(target, pickNonSpecialProps(source))
  }
  const result = await pending
  publish()
  if (!result.fetchPromise) {
    return result
  }
  // Core cache-and-fetch resolves the outer result before hooks finish.
  // Its background completion must also deliver response metadata.
  const fetchPromise = result.fetchPromise.then(publish)
  fetchPromise.catch(() => {})
  return { ...result, fetchPromise }
}
