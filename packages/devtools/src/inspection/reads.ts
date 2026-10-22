import type { CacheRequest, HistoryRequest, ReadReply, ReadRequest, SessionSummary, StoreSummary, Target } from '../protocol'
import type { RstoreDevtools, StoreRegistration } from '../runtime/types'
import * as v from 'valibot'
import { DevtoolsError, ReadSchemas } from '../protocol'
import { readCache } from './cache'
import { readCollections } from './collections'
import { createInspectionContext } from './context'
import { readModules } from './modules'
import { readPlugins } from './plugins'

/** Bound final detached reply, including DTO wrappers rather than previews only. */
function boundReply(reply: ReadReply<any>): ReadReply<any> {
  const size = () => new TextEncoder().encode(JSON.stringify(reply)).length
  while (size() > 512 * 1024) {
    reply.truncated = true
    const data = reply.data
    if (Array.isArray(data) && data.length)
      data.pop()
    else if (data?.rows?.length)
      data.rows.pop()
    else if (data?.entries?.length)
      data.entries.shift()
    else if (data?.layers?.length)
      data.layers.pop()
    else if (data?.metadata !== undefined)
      delete data.metadata
    else
      throw new DevtoolsError({ code: 'CAPACITY', message: 'Read reply metadata exceeds byte budget', target: reply.target })
  }
  return reply
}

/** Read retained detached descriptions, bounded even if active hook count is huge. */
export function readSubscriptions(registration: StoreRegistration, context: ReturnType<typeof createInspectionContext>) {
  const result: unknown[] = []
  for (const subscription of registration.subscriptions.values()) {
    if (result.length >= 1000 || context.remainingBytes < 1024) {
      context.markTruncated()
      break
    }
    const encoded = JSON.stringify(subscription)
    const size = new TextEncoder().encode(encoded).length
    if (size > context.remainingBytes) {
      context.markTruncated()
      break
    }
    context.consume(size)
    result.push(JSON.parse(encoded))
  }
  return result
}

/** Shared schema validation and exact-authority traversal for every transport. */
export function readRuntime(runtime: Pick<RstoreDevtools, 'session' | 'listStores' | 'resolve'>, input: ReadRequest): ReadReply<any> | SessionSummary[] | StoreSummary[] {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', message: 'Invalid read request' })
  const { method, ...arguments_ } = input
  if (!Object.hasOwn(ReadSchemas, method))
    throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', message: 'Unknown read method' })
  const parsed = v.safeParse(ReadSchemas[method] as v.GenericSchema, arguments_)
  if (!parsed.success)
    throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', message: 'Invalid read arguments' })
  if (method === 'rstore:list-sessions')
    return [runtime.session]
  if (method === 'rstore:list-stores') {
    if ((parsed.output as { sessionId: string }).sessionId !== runtime.session.sessionId)
      throw new DevtoolsError({ code: 'TARGET_NOT_FOUND', message: 'Session unavailable' })
    return runtime.listStores()
  }
  const registration = runtime.resolve((parsed.output as { target: Target }).target)
  const context = createInspectionContext(registration)
  const view = method.slice('rstore:get-'.length) as keyof StoreRegistration['revisions']
  let data: any
  let unavailable: string | undefined
  switch (method) {
    case 'rstore:get-collections':
      data = readCollections(registration, context)
      break
    case 'rstore:get-cache':
      data = readCache(registration, parsed.output as CacheRequest, context)
      if (!data)
        unavailable = 'Cache does not expose public inspection'
      break
    case 'rstore:get-history':
      data = registration.history.page(parsed.output as HistoryRequest)
      if (data.truncated)
        context.markTruncated()
      break
    case 'rstore:get-subscriptions':
      data = readSubscriptions(registration, context)
      break
    case 'rstore:get-modules':
      data = readModules(registration, context)
      break
    case 'rstore:get-plugins':
      data = readPlugins(registration, context)
      break
  }
  return boundReply({ target: { ...registration.target }, revision: registration.revisions[view], data: data ?? null, truncated: context.truncated, unavailable })
}
