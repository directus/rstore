import type { InspectableStore, RstoreDevtools } from '@rstore/devtools'
import type { SSRSnapshot, SSRStatus, SSRWorker } from '@rstore/devtools/node'
import type { Plugin } from '@rstore/shared'
import { createRstoreDevtools } from '@rstore/devtools'
import { captureSSRSnapshot, finalizeSSRSnapshot } from '@rstore/devtools/node'

/** Application request owns instrumentation and store cleanup until finalization. */
export interface SSRRequestHandle {
  /** Install before store factory initialization. */
  plugin: Plugin
  /** Connect actual store to request-owned disposal. */
  bindStore: (store: InspectableStore) => void
  /** Capture once after successful app rendering. */
  capture: () => void
  /** Always releases live request/store references, safe on repeated callbacks. */
  finalize: (status?: SSRStatus, error?: unknown) => void
  /** Current runtime for request diagnostics while active. */
  readonly runtime: RstoreDevtools
}

/** Begin isolated read-only request; rejected admission leaves application untouched. */
export function createSSRRequest(worker: SSRWorker, path: string, method: string): SSRRequestHandle | undefined {
  const startedAt = Date.now()
  const safePath = path.split(/[?#]/, 1)[0]!.slice(0, 8192)
  const safeMethod = method.slice(0, 32)
  const runtime = createRstoreDevtools({
    kind: 'ssr',
    label: `${safeMethod} ${safePath}`,
    request: { path: safePath, method: safeMethod, startedAt, status: 'active' },
  })
  const detach = worker.attach(runtime)
  if (!detach) {
    runtime.dispose()
    return undefined
  }
  let store: InspectableStore | undefined
  let captured: SSRSnapshot | undefined
  let finalized = false
  /** Traversal faults must not change application's render or error result. */
  function capture() {
    if (finalized || captured)
      return
    try {
      captured = captureSSRSnapshot(runtime, { path: safePath, method: safeMethod, startedAt, completedAt: Date.now(), status: 'completed' })
    }
    catch { /* Best-effort diagnostics have no application authority. */ }
  }
  return {
    runtime,
    plugin: runtime.plugin({ id: 'default', readOnly: true }),
    bindStore(value) {
      if (!finalized)
        store = value
    },
    capture,
    finalize(status = 'completed', error) {
      if (finalized)
        return
      capture()
      finalized = true
      try {
        if (!captured)
          captured = captureSSRSnapshot(runtime, { path: safePath, method: safeMethod, startedAt, completedAt: Date.now(), status, error })
        finalizeSSRSnapshot(captured, status, error)
        worker.complete(captured)
      }
      catch { /* Unavailable relay or capture never blocks response cleanup. */ }
      finally {
        detach()
        runtime.dispose()
        try {
          store?.$cache.dispose()
        }
        catch { /* Preserve original response outcome even if custom cleanup fails. */ }
        store = undefined
        captured = undefined
      }
    },
  }
}
