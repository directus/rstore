import type { DevframeNodeContext, DevframeNodeRpcSession } from 'devframe'
import type { Action, ReadMethod, ReadRequest, SessionSummary } from '../protocol'
import type { RstoreDevtools } from '../runtime/types'
import type { createRoleAuth } from './auth'
import type { ProducerRegistry } from './producer-registry'
import * as v from 'valibot'
import { publicRpcDefinitions } from '../agent/catalog'
import { DevtoolsError, HandshakeSchema, READ_METHODS, RuntimeInvalidationSchema, SessionSummarySchema, validateReadResult } from '../protocol'
import { isBoundedJson } from '../protocol/json'
import { broadcastInvalidation } from './invalidation'
import { createRelayDispatch } from './routing'

/** Producer publication validates protocol, shape, identity and metadata budget. */
const PublicationSchema = v.pipe(v.custom<unknown>(input => isBoundedJson(input, {
  maxBytes: 65536,
  maxDepth: 10,
  maxEntries: 10000,
  omitUndefinedProperties: true,
}), 'Invalid or over-budget producer publication'), v.strictObject({ handshake: HandshakeSchema, session: SessionSummarySchema }))
/** Check bounded metadata before it becomes authoritative. */
function summary(input: v.InferOutput<typeof PublicationSchema>, role: string): SessionSummary {
  if (input.handshake.sessionId !== input.session.sessionId || input.session.kind !== role)
    throw new DevtoolsError({ code: 'PROTOCOL_MISMATCH', message: 'Producer identity or role mismatch' })
  if (input.session.stores.length > 100 || new TextEncoder().encode(JSON.stringify(input.session)).length > 65536)
    throw new DevtoolsError({ code: 'CAPACITY', message: 'Producer metadata capacity exceeded' })
  if (input.session.stores.some(store => store.target.sessionId !== input.session.sessionId || (role === 'ssr' && !store.capabilities.readOnly)))
    throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', message: 'Invalid producer store authority' })
  return { ...input.session, connected: true }
}
/** Install public catalog and private exact-owner control plane on Devframe. */
export function registerRelayHandlers(context: DevframeNodeContext, registry: ProducerRegistry, auth: ReturnType<typeof createRoleAuth>, runtime?: RstoreDevtools, unregister?: (producerId: number, sessionId?: string) => void) {
  const dispatch = createRelayDispatch(registry, runtime)
  /** Emit detached invalidation to viewers; optional avoids absent consumer errors. */
  function invalidate(event: unknown) {
    broadcastInvalidation(context, event)
  }
  for (const definition of publicRpcDefinitions(async (method, input) => {
    try {
      if (READ_METHODS.includes(method as ReadMethod)) {
        const request = { ...(input as object), method } as ReadRequest
        return validateReadResult(method as ReadMethod, await dispatch.route(request), 'target' in request ? request.target : undefined)
      }
      return await dispatch.route(input as Action, true)
    }
    catch (error) {
      let wireSession = false
      try {
        wireSession = Boolean(context.rpc.getCurrentRpcSession())
      }
      catch { /* Local MCP can invoke handlers before a transport context exists. */ }
      // Upstream structured-clone preserves only Error message/name. A plain
      // protocol payload preserves code/target/outcome while local MCP keeps Error.
      if (wireSession && error instanceof DevtoolsError)
        throw error.details
      throw error
    }
  })) context.rpc.register(definition)
  /** Authenticated session captured at private call entry; never from input metadata. */
  function owner(): DevframeNodeRpcSession {
    const session = context.rpc.getCurrentRpcSession()
    auth.requireProducer(session)
    return session!
  }
  context.rpc.register({
    name: 'rstore:producer-register',
    type: 'action',
    args: [v.unknown()],
    jsonSerializable: true,
    handler(input: unknown) {
      try {
        const session = owner()
        const parsed = v.safeParse(PublicationSchema, input)
        if (!parsed.success) {
          const mismatch = parsed.issues.some(issue => issue.path?.some(entry => entry.key === 'protocolVersion'))
          throw new DevtoolsError({ code: mismatch ? 'PROTOCOL_MISMATCH' : 'INVALID_ARGUMENTS', message: 'Invalid producer publication' })
        }
        const publication = summary(parsed.output, auth.requireProducer(session))
        const authority = registry.register(publication, session)
        invalidate({ view: 'registry', revision: authority.epoch })
        return { ok: true, epoch: authority.epoch }
      }
      catch (error) {
        return { ok: false, error: error instanceof DevtoolsError ? error.details : { code: 'INVALID_ARGUMENTS', message: 'Invalid producer publication' } }
      }
    },
  })
  context.rpc.register({
    name: 'rstore:producer-publish',
    type: 'action',
    args: [PublicationSchema, RuntimeInvalidationSchema],
    jsonSerializable: true,
    handler(input: v.InferOutput<typeof PublicationSchema>, event: unknown) {
      const session = owner()
      registry.publish(summary(input, auth.requireProducer(session)), session)
      invalidate(event)
    },
  })
  context.rpc.register({
    name: 'rstore:producer-unregister',
    type: 'action',
    args: [v.optional(v.string())],
    jsonSerializable: true,
    handler(sessionId?: string) {
      const session = owner()
      if (sessionId)
        registry.detach(sessionId, session)
      else registry.disconnect(session.meta.id)
      unregister?.(session.meta.id, sessionId)
      invalidate({ view: 'registry', revision: Date.now() })
    },
  })
  const unsubscribe = runtime?.subscribe(invalidate)
  return { dispatch, unsubscribe, invalidate }
}
