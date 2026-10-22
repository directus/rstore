import type { ProjectionBudget } from '../projection'
import type { ReadReply, ReadRequest, ViewName } from '../protocol'
import type { RstoreDevtools, StoreRegistration } from '../runtime/types'
import type { SSRRequestMetadata, SSRSnapshot, SSRStatus, SSRStoreSnapshot } from './types'
import * as v from 'valibot'
import { readCache } from '../inspection/cache'
import { readCollections } from '../inspection/collections'
import { createInspectionContext, inspectCache } from '../inspection/context'
import { readModules } from '../inspection/modules'
import { readPlugins } from '../inspection/plugins'
import { readSubscriptions } from '../inspection/reads'
import { createProjectionBudget } from '../projection'
import { CacheRequestSchema, DevtoolsError, HistoryRequestSchema, ReadSchemas, validateReadResult } from '../protocol'
import { projectSSRFailure } from './error'
import { boundSSRMetadata, encodedSSRBytes as bytes, detachSSRSnapshot, SSR_SNAPSHOT_BYTES } from './snapshotBudget'

/** Input metadata intentionally excludes raw event/request and credentials. */
export type SSRCaptureMetadata = Omit<SSRRequestMetadata, 'duration' | 'error'> & { error?: unknown }
export { SSR_SNAPSHOT_BYTES } from './snapshotBudget'

/** Update terminal metadata without traversing a rendered/disposed source store. */
export function finalizeSSRSnapshot(snapshot: SSRSnapshot, status: SSRStatus, error?: unknown, completedAt = Date.now()) {
  snapshot.request.status = status
  snapshot.request.completedAt = completedAt
  snapshot.request.duration = Math.max(0, completedAt - snapshot.request.startedAt)
  snapshot.session.completedAt = completedAt
  if (error !== undefined) {
    // Discovery and capture carry the same detached error; reserve both copies.
    const remaining = Math.floor((SSR_SNAPSHOT_BYTES - bytes(snapshot) - 512) / 2)
    if (remaining >= 128)
      snapshot.request.error = projectSSRFailure(error, Math.min(8192, remaining))
    else
      snapshot.truncated = true
  }
  snapshot.session.request = { ...snapshot.request }
}

/** Capture through shared bounded readers with one cumulative value allowance. */
export function captureSSRSnapshot(runtime: RstoreDevtools, metadata: SSRCaptureMetadata): SSRSnapshot {
  const summaries = runtime.listStores()
  const summary = summaries[0]
  const target = summary?.target ?? { sessionId: runtime.session.sessionId, storeId: 'default', generation: 1 }
  const request: SSRRequestMetadata = {
    path: metadata.path.split(/[?#]/, 1)[0]!.slice(0, 8192),
    method: metadata.method.slice(0, 32),
    startedAt: metadata.startedAt,
    completedAt: metadata.completedAt,
    duration: Math.max(0, metadata.completedAt - metadata.startedAt),
    status: metadata.status,
  }
  const snapshot: SSRSnapshot = {
    session: { ...runtime.session, stores: summaries, connected: false, completed: true, completedAt: metadata.completedAt, request },
    request,
    target: { ...target },
    views: {},
    truncated: false,
  }
  if (metadata.error !== undefined)
    request.error = projectSSRFailure(metadata.error, 8192)
  if (summaries.length > 1)
    snapshot.additionalStores = summaries.slice(1).map(store => ({ target: { ...store.target }, views: {} }))
  boundSSRMetadata(snapshot)
  if (!summary)
    return detachSSRSnapshot(snapshot)
  // Every store consumes one cumulative allowance; never reset it per target.
  const budget = createProjectionBudget(384 * 1024)
  for (const section of [snapshot, ...snapshot.additionalStores ?? []]) {
    if (budget.remainingBytes < 1024 || bytes(snapshot) > SSR_SNAPSHOT_BYTES - 16 * 1024) {
      snapshot.truncated = true
      continue
    }
    try {
      captureStore(snapshot, section, runtime.resolve(section.target), budget)
    }
    catch { /* A disposed/custom store cannot discard other completed captures. */
      snapshot.truncated = true
    }
  }
  return detachSSRSnapshot(snapshot)
}

/** Capture one store without duplicating primary views or resetting request budgets. */
function captureStore(snapshot: SSRSnapshot, section: SSRStoreSnapshot, registration: StoreRegistration, budget: ProjectionBudget): void {
  const target = section.target
  // Leave 128 KiB for DTO names/keys, page metadata, target and error wrappers.
  const context = createInspectionContext(registration, budget)
  /** A section fault never prevents request disposal or neighboring captures. */
  function capture(view: ViewName, reader: () => unknown): ReadReply {
    try {
      const data = reader()
      return { target: { ...target }, revision: registration.revisions[view], data, truncated: context.truncated }
    }
    catch {
      snapshot.truncated = true
      return { target: { ...target }, revision: registration.revisions[view], data: null, truncated: true, unavailable: 'SSR section could not be captured' }
    }
  }
  /** Admit detached sections only while envelope fits, before further traversal. */
  function include(view: Exclude<ViewName, 'cache'>, reader: () => unknown) {
    if (context.remainingBytes < 1024 || bytes(snapshot) > SSR_SNAPSHOT_BYTES - 16 * 1024) {
      snapshot.truncated = true
      return
    }
    section.views[view] = capture(view, reader)
    if (bytes(snapshot) > SSR_SNAPSHOT_BYTES) {
      delete section.views[view]
      snapshot.truncated = true
    }
  }
  include('collections', () => readCollections(registration, context))
  include('history', () => {
    const page = registration.history.page({ limit: 500, maxBytes: Math.max(0, context.remainingBytes - 1024) })
    if (page.entries.length && page.oldestSequence !== undefined && page.entries[0]!.sequence > page.oldestSequence)
      page.truncated = true
    if (page.truncated)
      context.markTruncated()
    context.consume(bytes(page))
    return page
  })
  section.views.cache = Object.create(null)
  try {
    const inspection = inspectCache(registration)
    let collectionCount = 0
    for (const collection of inspection?.collections ?? []) {
      if (++collectionCount > 1000 || context.remainingBytes < 1024 || bytes(snapshot) > SSR_SNAPSHOT_BYTES - 16 * 1024) {
        snapshot.truncated = true
        break
      }
      const reply = capture('cache', () => readCache(registration, { target, collection: collection.name, view: 'effective', page: { offset: 0, limit: 500 } }, context))
      if (reply.data && (reply.data as { matchingTotal: number }).matchingTotal > (reply.data as { rows: unknown[] }).rows.length)
        reply.truncated = true
      snapshot.truncated ||= reply.truncated
      section.views.cache![collection.name] = reply
      if (bytes(snapshot) > SSR_SNAPSHOT_BYTES) {
        delete section.views.cache![collection.name]
        snapshot.truncated = true
        break
      }
    }
  }
  catch { /* Inspection adapters and iterable readers are application extensions. */
    snapshot.truncated = true
  }
  include('subscriptions', () => readSubscriptions(registration, context))
  include('modules', () => readModules(registration, context))
  include('plugins', () => readPlugins(registration, context))
  snapshot.truncated ||= context.truncated
}

/** Serve immutable recorded pages through the same strict read argument schemas. */
export function readSSRSnapshot(snapshot: SSRSnapshot, request: ReadRequest): unknown {
  const { method, ...input } = request
  const schema = ReadSchemas[method]
  const parsed = schema && v.safeParse(schema, input)
  if (!parsed || !parsed.success)
    throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', message: 'Invalid recorded read arguments' })
  if (method === 'rstore:list-sessions')
    return [JSON.parse(JSON.stringify(snapshot.session))]
  if (method === 'rstore:list-stores') {
    if (request.sessionId !== snapshot.session.sessionId)
      throw new DevtoolsError({ code: 'TARGET_NOT_FOUND', message: 'Recorded session unavailable' })
    return JSON.parse(JSON.stringify(snapshot.session.stores))
  }
  const target = request.target
  const section = [snapshot, ...snapshot.additionalStores ?? []].find(store =>
    target.sessionId === store.target.sessionId && target.storeId === store.target.storeId && target.generation === store.target.generation)
  if (!section)
    throw new DevtoolsError({ code: 'STALE_TARGET', message: 'Recorded target unavailable', target })
  const view = method.slice('rstore:get-'.length) as ViewName
  const cacheRequest = method === 'rstore:get-cache' ? v.parse(CacheRequestSchema, input) : undefined
  const cache = section.views.cache
  const source = view === 'cache'
    ? cache && Object.hasOwn(cache, cacheRequest!.collection) ? cache[cacheRequest!.collection] : undefined
    : section.views[view]
  const result: ReadReply = source
    ? JSON.parse(JSON.stringify(source))
    : { target, revision: 0, data: null, truncated: snapshot.truncated, unavailable: 'Section not captured' }
  if (cacheRequest && result.data) {
    const reply = validateReadResult('rstore:get-cache', result, target)
    const page = reply.data!
    if (cacheRequest.layerId !== undefined || cacheRequest.view === 'committed')
      return { ...result, data: null, unavailable: 'Only effective cache rows captured' }
    const rows = page.rows.filter(row =>
      (cacheRequest.keySearch === undefined || String(row.key).includes(cacheRequest.keySearch))
      && (cacheRequest.contentSearch === undefined || JSON.stringify(row.value).includes(cacheRequest.contentSearch)))
    page.matchingTotal = result.truncated ? null : rows.length
    page.rows = rows.slice(cacheRequest.page.offset, cacheRequest.page.offset + cacheRequest.page.limit)
    page.offset = cacheRequest.page.offset
    page.limit = cacheRequest.page.limit
    return reply
  }
  if (view === 'history' && result.data) {
    const historyRequest = v.parse(HistoryRequestSchema, input)
    const reply = validateReadResult('rstore:get-history', result, target)
    const entries = reply.data!.entries.filter(entry =>
      (historyRequest.beforeSequence === undefined || entry.sequence < historyRequest.beforeSequence)
      && (historyRequest.afterSequence === undefined || entry.sequence > historyRequest.afterSequence))
    reply.data!.entries = historyRequest.afterSequence === undefined ? entries.slice(-historyRequest.limit) : entries.slice(0, historyRequest.limit)
    return reply
  }
  return result
}
