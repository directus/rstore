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
  /** Detach response-version links before completion reaches any caller. */
  releaseVersions: Set<() => void>
}

/** Weak ownership keeps completed requests from retaining their consumers. */
const consumers = new WeakMap<Promise<unknown>, QueryConsumers>()

/** Current borrowed-version link for each caller-owned metadata object. */
const versionLinks = new WeakMap<CustomHookMeta, () => void>()

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
    return group && group.meta !== meta ? shareQueryMetadata(pending, group, meta) : pending
  }
  const checks = new Set([meta.$canPublishQuery] as Array<CustomHookMeta['$canPublishQuery']>)
  const canPublish = () => [...checks].some(check => !check || check())
  // Preserve the metadata object: plugins publish response metadata into it.
  if (meta.$canPublishQuery) {
    meta.$canPublishQuery = canPublish
  }
  const group: QueryConsumers = { meta, checks, canPublish, releaseVersions: new Set() }
  const promise = fetch(meta)
  promises.set(key, promise)
  consumers.set(promise, group)
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
    for (const detach of group.releaseVersions)
      detach()
    if (promises.get(key) === promise) {
      promises.delete(key)
    }
  }
}

/** Share hook results without copying another consumer's private tracking state. */
async function shareQueryMetadata<TResult extends QueryResult<unknown>>(
  pending: Promise<TResult>,
  group: QueryConsumers,
  target: CustomHookMeta,
): Promise<TResult> {
  const source = group.meta
  // Caller metadata may take opposite roles in simultaneous request groups.
  // A source must own its current value before another object points to it;
  // otherwise installing the reverse link creates circular accessors.
  versionLinks.get(source)?.()
  versionLinks.get(target)?.()
  /** Read this request's version while its hooks can still publish cache writes. */
  const readVersion = () => source.$resultVersion
  // Cache publication can run before the shared promise resolves. Every
  // consumer's guard must see the hook's version while those writes run.
  Object.defineProperty(target, '$resultVersion', {
    configurable: true,
    enumerable: true,
    get: readVersion,
    /** Detach the shared version when this consumer's response completes. */
    set(value: CustomHookMeta['$resultVersion']) {
      Object.defineProperty(target, '$resultVersion', { configurable: true, enumerable: true, writable: true, value })
      releaseLink()
    },
  })
  /** Remove only this request's registration when metadata ownership changes. */
  function releaseLink(): void {
    group.releaseVersions.delete(detachVersion)
    if (versionLinks.get(target) === detachVersion)
      versionLinks.delete(target)
  }
  /** A prior completion must not detach a newer request's metadata link. */
  function detachVersion(): void {
    if (Object.getOwnPropertyDescriptor(target, '$resultVersion')?.get === readVersion)
      target.$resultVersion = source.$resultVersion
    releaseLink()
  }
  group.releaseVersions.add(detachVersion)
  versionLinks.set(target, detachVersion)
  /** Copy ordinary response fields; publication guards and ownership stay local. */
  function publish(complete = false): void {
    Object.assign(target, pickNonSpecialProps(source))
    if (complete)
      detachVersion()
  }
  /** Failed responses must also release metadata links before callers retry. */
  function reject(error: unknown): never {
    detachVersion()
    throw error
  }
  // Leaving a failed follower linked to its source creates circular getters
  // when those caller-owned metadata objects start the next request in reverse.
  let result: TResult
  try {
    result = await pending
  }
  catch (error) {
    reject(error)
  }
  publish(!result.fetchPromise)
  if (!result.fetchPromise) {
    return result
  }
  // Core cache-and-fetch resolves the outer result before hooks finish.
  // Its background completion must also deliver response metadata.
  const fetchPromise = result.fetchPromise.then(() => publish(true), reject)
  fetchPromise.catch(() => {})
  return { ...result, fetchPromise }
}
