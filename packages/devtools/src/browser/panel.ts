import type { ConnectPanelChannelOptions, PanelChannel } from 'devframe/in-page-channel'
import type { Action, ActionResult, ReadReply, ReadRequest, SessionSummary, StoreSummary, Target, ViewName } from '../protocol'
import type { RuntimeInvalidation } from '../runtime/types'
import type { BrowserChannelProtocol, ChannelResult } from './protocol'
import { connectPanelChannel, InPageChannelError } from 'devframe/in-page-channel'
import * as v from 'valibot'
import { ActionResultSchema, DevtoolsError, parseAction, ReadSchemas, RuntimeInvalidationSchema, validateReadResult } from '../protocol'
import { channelDeadline } from './dispatch'
import { browserOrigins } from './handshake'
import { CHANNEL_NAME, ChannelResultSchema } from './protocol'

/** Official panel options with caller-owned parent/source discovery. */
export type BrowserPanelOptions = Pick<ConnectPanelChannelOptions<BrowserChannelProtocol>, 'targets' | 'allowedOrigins' | 'window' | 'transport' | 'instanceId'>
/** Detached in-page consumer; owns its leases, never the producer runtime. */
export interface BrowserPanel {
  /** Underlying official lifecycle/status endpoint. */
  readonly channel: PanelChannel<BrowserChannelProtocol>
  /** Read selected section or registry. */
  read: (request: ReadRequest) => Promise<ReadReply<any> | SessionSummary[] | StoreSummary[]>
  /** Execute one command; uncertain outcome is never retried automatically. */
  execute: (action: Action) => Promise<ActionResult>
  /** Receive detached view/registry revisions. */
  subscribe: (listener: (event: RuntimeInvalidation) => void) => () => void
  /** Begin renewable observation of one exact target and release explicitly. */
  watch: (target: Target, view: ViewName) => Promise<() => void>
  /** Bound initial connection discovery. */
  whenConnected: (timeoutMs?: number) => Promise<void>
  /** Close owned endpoint and leases; safe to repeat. */
  dispose: () => void
}

/** Connect through Devframe's versioned ancestor/MessagePort discovery. */
export function connectBrowserPanel(options: BrowserPanelOptions = {}): BrowserPanel {
  const channel = connectPanelChannel<BrowserChannelProtocol>({
    ...options,
    allowedOrigins: browserOrigins(options),
    name: CHANNEL_NAME,
    functions: {},
    events: { 'rstore:invalidate': { type: 'event', jsonSerializable: true, args: [RuntimeInvalidationSchema] } },
    callTimeoutMs: 30000,
  })
  const releases = new Set<() => void>()
  let disposed = false
  /** Recover structured errors before exposing transport-independent results. */
  async function unwrap<T>(work: Promise<ChannelResult<T>>, action = false): Promise<T> {
    try {
      const received = await channelDeadline(work, action ? 30000 : 10000, action)
      const parsed = v.safeParse(ChannelResultSchema, received)
      if (!parsed.success)
        throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', message: 'Invalid channel reply' })
      const reply = parsed.output as ChannelResult<T>
      if (!reply.ok)
        throw new DevtoolsError(reply.error)
      return reply.value
    }
    catch (error) {
      if (error instanceof InPageChannelError && error.code === 'invalid-args')
        throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', message: error.message })
      if (action && !(error instanceof DevtoolsError))
        throw new DevtoolsError({ code: 'UNKNOWN_OUTCOME', message: error instanceof Error ? error.message : 'Action connection lost', outcome: 'unknown' })
      throw error
    }
  }
  /** Dispatch exact public function ID with shared envelope. */
  function read(request: ReadRequest): ReturnType<BrowserPanel['read']> {
    const { method, ...input } = request
    try {
      const parsed = v.parse(ReadSchemas[method], input)
      return unwrap(channel.call(method, parsed as never)).then(value => validateReadResult(method, value, 'target' in request ? request.target : undefined))
    }
    catch (error) {
      return Promise.reject(new DevtoolsError({ code: 'INVALID_ARGUMENTS', message: error instanceof Error ? error.message : 'Invalid inspection request' }))
    }
  }
  /** Validate before dispatch as well as at producer, preserving schema failure details across birpc. */
  function execute(input: Action): Promise<ActionResult> {
    try {
      const action = parseAction(input)
      return unwrap(channel.call(`rstore:${action.action}`, action), true).then((value) => {
        const result = v.safeParse(ActionResultSchema, value)
        if (!result.success)
          throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', message: 'Invalid action reply' })
        if (result.output.commandId !== action.commandId || result.output.action !== action.action
          || result.output.target.sessionId !== action.target.sessionId
          || result.output.target.storeId !== action.target.storeId
          || result.output.target.generation !== action.target.generation) {
          throw new DevtoolsError({ code: 'STALE_TARGET', message: 'Action reply differs from requested command', target: action.target })
        }
        return result.output
      })
    }
    catch (error) {
      return Promise.reject(new DevtoolsError({ code: 'INVALID_ARGUMENTS', message: error instanceof Error ? error.message : 'Invalid action' }))
    }
  }
  /** Renew scoped reactive interest and release it on shutdown. */
  async function watch(target: Target, view: ViewName): Promise<() => void> {
    const subscriptionId = globalThis.crypto.randomUUID()
    const request = { subscriptionId, target, view, active: true }
    await unwrap(channel.call('rstore:watch', request))
    if (disposed) {
      void channel.call('rstore:watch', { ...request, active: false }).catch(() => {})
      throw new DevtoolsError({ code: 'UNAVAILABLE', message: 'Panel disposed' })
    }
    let active = true
    const timer = setInterval(() => {
      void unwrap(channel.call('rstore:watch', request)).catch(() => release())
    }, 15000)
    /** End only this viewer lease; other panels remain connected. */
    function release(): void {
      if (!active)
        return
      active = false
      clearInterval(timer)
      releases.delete(release)
      if (channel.status === 'connected')
        void channel.call('rstore:watch', { ...request, active: false }).catch(() => {})
    }
    releases.add(release)
    return release
  }
  return {
    channel,
    read,
    watch,
    execute,
    subscribe: listener => channel.on('rstore:invalidate', listener),
    whenConnected: timeout => channel.whenConnected(timeout ?? 10000),
    dispose: () => {
      if (disposed)
        return
      disposed = true
      for (const release of releases) release()
      channel.close()
    },
  }
}
