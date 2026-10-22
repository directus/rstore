import type { RstoreDevtools } from '@rstore/devtools'
import type { BrowserDevtoolsOptions, BrowserPanelOptions } from '@rstore/devtools/browser'
import type { ProducerConnection, RstoreDevframeOptions, SSRWorker } from '@rstore/devtools/node'
import type { Action, ReadRequest, Target } from '@rstore/devtools/protocol'
import type { Plugin } from 'vite'
import { createRstoreDevtools } from '@rstore/devtools'
import { connectBrowserPanel, createBrowserDevtools } from '@rstore/devtools/browser'
import { connectRstoreDevtools, createRstoreDevframe, createRstoreDevframeHost, createSSRWorker } from '@rstore/devtools/node'
import { rstoreDevtools } from '@rstore/devtools/vite'
import { createVueDevtoolsAdapter, RstoreDevtoolsPanel } from '@rstore/devtools/vue'

/** Compile-time oracle fails if obsolete helper becomes exported again. */
// @ts-expect-error Clean cutover removes this legacy helper instead of aliasing it.
export type RemovedLegacyHelper = typeof import('@rstore/devtools').getRstoreDevtoolsSrc

/** Compile optional host APIs from installed declarations, without aliases. */
export function publicConsumer() {
  const runtime: RstoreDevtools = createRstoreDevtools({ kind: 'node' })
  const options: BrowserDevtoolsOptions = { relay: false }
  const panel: BrowserPanelOptions = { targets: [window] }
  const host: RstoreDevframeOptions = { runtime, basePath: '/portable/', authTokens: { node: ['explicit-node-token'] } }
  const target: Target = { sessionId: 'consumer', storeId: 'store', generation: 1 }
  const read: ReadRequest = { method: 'rstore:get-history', target }
  const action: Action = { target, action: 'clear-history', commandId: 'explicit-command', issuedAt: Date.now() }
  const plugin: Plugin = rstoreDevtools({ base: '/portable/' })
  const definition = createRstoreDevframe(host)
  const producer: ProducerConnection = connectRstoreDevtools(runtime, { baseURL: 'http://127.0.0.1:9999/portable/', authToken: 'explicit-node-token' })
  const worker: SSRWorker = createSSRWorker({ baseURL: 'http://127.0.0.1:9999/portable/', authToken: 'private-ssr-token' })
  return { runtime, options, panel, read, action, plugin, definition, producer, worker, createRstoreDevframeHost, createBrowserDevtools, connectBrowserPanel, createVueDevtoolsAdapter, RstoreDevtoolsPanel }
}
