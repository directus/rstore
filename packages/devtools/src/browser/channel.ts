import type { CreatePageScriptChannelOptions, PageScriptChannel } from 'devframe/in-page-channel'
import type { RstoreDevtools } from '../runtime/types'
import type { BrowserChannelProtocol, WatchRequest } from './protocol'
import { createPageScriptChannel } from 'devframe/in-page-channel'
import * as v from 'valibot'
import { executeAction } from '../actions'
import { ACTION_NAMES, ActionResultSchema, ActionSchema, DevtoolsError, READ_METHODS, ReadResultSchemas, ReadSchemas, validateReadResult } from '../protocol'
import { channelResult } from './dispatch'
import { browserOrigins } from './handshake'
import { CHANNEL_NAME, channelResultSchema, WatchSchema } from './protocol'

/** Scope one page endpoint to exact accepted viewer origins. */
export interface BrowserChannelOptions {
  /** Same-origin by default; never insert a wildcard. */
  allowedOrigins?: string[]
  /** Host page window; false is reserved for explicit MessagePort tests. */
  window?: Window | false
}

/** Official Devframe page channel plus owned invalidation and observation cleanup. */
export function createBrowserChannel(runtime: RstoreDevtools, options: BrowserChannelOptions = {}): PageScriptChannel<BrowserChannelProtocol> {
  const allowedOrigins = browserOrigins(options)
  const functions: Record<string, unknown> = {}
  const leases = new Map<string, { release: () => void, touched: number, identity: string }>()
  let disposed = false
  /** Release a lease exactly once and remove its authority. */
  function release(id: string): void {
    const lease = leases.get(id)
    leases.delete(id)
    lease?.release()
  }
  /** Refresh or end a bounded observation lease; generation stays part of its identity. */
  function watch(input: WatchRequest): null {
    if (disposed)
      throw new DevtoolsError({ code: 'UNAVAILABLE', message: 'Browser endpoint disposed' })
    if (!input.active) {
      release(input.subscriptionId)
      return null
    }
    // Renewal keeps checking exact generation; a lease cannot revive removed authority.
    runtime.resolve(input.target)
    const identity = JSON.stringify([input.target, input.view])
    const previous = leases.get(input.subscriptionId)
    if (previous && previous.identity !== identity)
      throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', message: 'Observation lease target changed' })
    if (previous) {
      previous.touched = Date.now()
      return null
    }
    if (leases.size >= 1000)
      throw new DevtoolsError({ code: 'CAPACITY', message: 'Too many browser observation leases' })
    leases.set(input.subscriptionId, {
      release: runtime.subscribe(() => {}, input.target, input.view),
      touched: Date.now(),
      identity,
    })
    return null
  }
  for (const method of READ_METHODS) {
    functions[method] = {
      type: 'query',
      jsonSerializable: true,
      args: [ReadSchemas[method]],
      returns: channelResultSchema(ReadResultSchemas[method]),
      handler: (input: object) => channelResult(() => validateReadResult(method, runtime.read({ method, ...input } as Parameters<RstoreDevtools['read']>[0]))),
    }
  }
  for (const action of ACTION_NAMES) {
    functions[`rstore:${action}`] = {
      type: 'action',
      jsonSerializable: true,
      args: [ActionSchema],
      returns: channelResultSchema(ActionResultSchema),
      handler: (input: Parameters<typeof executeAction>[1]) => channelResult(() => {
        if ((input as { action: string }).action !== action)
          throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', message: 'Action does not match called method' })
        return executeAction(runtime, input)
      }, true),
    }
  }
  functions['rstore:watch'] = {
    type: 'query',
    jsonSerializable: true,
    args: [WatchSchema],
    returns: channelResultSchema(v.null()),
    handler: (input: WatchRequest) => channelResult(() => watch(input)),
  }
  const channel = createPageScriptChannel<BrowserChannelProtocol>({
    ...options,
    allowedOrigins,
    name: CHANNEL_NAME,
    callTimeoutMs: 30000,
    functions: functions as CreatePageScriptChannelOptions<BrowserChannelProtocol>['functions'],
  })
  const unsubscribe = runtime.subscribe((event) => {
    // Registry invalidations have no target. Explicit undefined is not JSON and Devframe rejects it.
    channel.emit('rstore:invalidate', {
      view: event.view,
      revision: event.revision,
      ...(event.target ? { target: { ...event.target } } : {}),
    })
  })
  const timer = setInterval(() => {
    for (const [id, lease] of leases) {
      if (Date.now() - lease.touched > 30000)
        release(id)
    }
  }, 15000)
  channel.events.on('panel:disconnected', () => {
    if (!channel.panels.length) {
      for (const id of leases.keys())
        release(id)
    }
  })
  const close = channel.close
  channel.close = () => {
    if (disposed)
      return
    disposed = true
    clearInterval(timer)
    unsubscribe()
    for (const id of leases.keys()) release(id)
    close()
  }
  return channel
}
