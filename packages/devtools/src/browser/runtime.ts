import type { RstoreDevtools, RuntimeOptions } from '../runtime'
import type { BrowserChannelOptions } from './channel'
import { createRstoreDevtools } from '../runtime'
import { createBrowserChannel } from './channel'
import { connectBrowserRelay } from './relay'

/** Explicit browser hosting; asset URLs and relay URLs remain independent. */
export interface BrowserDevtoolsOptions extends RuntimeOptions, BrowserChannelOptions {
  /** Optional existing relay origin/base path. */
  baseURL?: string
  /** Disable relay entirely for in-page inspection. */
  relay?: false
  /** In-memory producer credential from trusted same-origin host bootstrap. */
  authToken?: string
}

/** Own portable runtime, official in-page endpoint, and optional relay connection. */
export function createBrowserDevtools(options: BrowserDevtoolsOptions = {}): RstoreDevtools {
  const runtime = createRstoreDevtools({ ...options, kind: 'browser' })
  let channel: ReturnType<typeof createBrowserChannel> | undefined
  let relay: ReturnType<typeof connectBrowserRelay> | undefined
  try {
    channel = createBrowserChannel(runtime, options)
    relay = options.relay !== false && options.baseURL
      ? connectBrowserRelay(runtime, { baseURL: options.baseURL, authToken: options.authToken })
      : undefined
  }
  catch (error) {
    channel?.close()
    runtime.dispose()
    throw error
  }
  const dispose = runtime.dispose
  let disposed = false
  runtime.dispose = () => {
    if (disposed)
      return
    disposed = true
    channel?.close()
    relay?.dispose()
    dispose()
  }
  // Producer handshake failure belongs to relay status, never an unhandled application rejection.
  void relay?.ready.catch(() => {})
  return runtime
}
