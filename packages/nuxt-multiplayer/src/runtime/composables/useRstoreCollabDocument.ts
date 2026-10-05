import type { CollabCacheStoreLike } from '@rstore/multiplayer'
import type { CollabClient, CollabClientStatus, DocOp, DocState, TransformOptions } from '@rstore/multiplayer/ot'
import type { ShallowRef } from 'vue'
import { bindCollabCache } from '@rstore/multiplayer'
import { createCollabClient } from '@rstore/multiplayer/ot'
import { isCollabServerMessage } from '@rstore/multiplayer/protocol'
import { useWebSocket } from '@vueuse/core'
import { useNuxtApp, useRuntimeConfig } from 'nuxt/app'
import { onScopeDispose, ref, shallowRef, triggerRef, watch } from 'vue'

/** Options of {@link useRstoreCollabDocument}. */
export interface UseRstoreCollabDocumentOptions {
  /**
   * Collection of the node rows: the document is mirrored into the rstore
   * cache (pending edits in a layer). The store must use
   * `createMultiplayerPlugin({ ot: { collections: [collection] } })`.
   */
  collection?: string
  /** WebSocket endpoint. @default runtimeConfig.public.rstoreMultiplayerEndpoint (set by `@rstore/nuxt-multiplayer-server`) */
  endpoint?: string
  /** Stable id of this tab or device. @default a random id */
  clientId?: string
  /** Must match the server's `transform` options. */
  transform?: TransformOptions
}

/** Reactive collab document returned by {@link useRstoreCollabDocument}. */
export interface RstoreCollabDocument {
  /** The OT client (for the ProseMirror binding, undo and events). */
  client: CollabClient
  /** What the user sees: confirmed nodes plus pending local edits. Triggers on every change. */
  state: ShallowRef<DocState>
  /** Whether the first snapshot arrived (edits are refused before). */
  loaded: ShallowRef<boolean>
  /** `synchronized`, `awaiting` or `awaiting-with-buffer`. */
  status: ShallowRef<CollabClientStatus>
  /** WebSocket status. */
  connection: ShallowRef<string>
  /** Applies a local edit and sends it. Returns the inverse ops. */
  submit: (ops: DocOp[]) => DocOp[]
}

/** Absolute WebSocket URL of an endpoint path, in the browser. */
function resolveSocketUrl(endpoint: string): string {
  if (!endpoint.startsWith('/') || typeof location === 'undefined') {
    return endpoint
  }
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${endpoint}`
}

/**
 * Opens a collab document (rich-text OT, experimental) on the multiplayer
 * endpoint of `@rstore/nuxt-multiplayer-server` (module option `collab`).
 * Edits apply locally at once and are sequenced by the server; the client
 * resumes from its confirmed version after a reconnect. The document closes
 * when the calling component (or effect scope) is disposed.
 */
export function useRstoreCollabDocument(docId: string, options: UseRstoreCollabDocumentOptions = {}): RstoreCollabDocument {
  const runtimeConfig = useRuntimeConfig()
  const endpoint = options.endpoint ?? (runtimeConfig.public.rstoreMultiplayerEndpoint as string | undefined) ?? '/api/rstore-multiplayer/ws'
  // The socket is assigned right after the client: nothing is sent before it opens.
  let socket: ReturnType<typeof useWebSocket>
  const client = createCollabClient({
    docId,
    clientId: options.clientId ?? globalThis.crypto.randomUUID(),
    transform: options.transform,
    send: frame => socket.send(JSON.stringify(frame)),
  })
  socket = useWebSocket(resolveSocketUrl(endpoint), {
    autoReconnect: true,
    immediate: typeof window !== 'undefined',
    onMessage: (_ws, event) => {
      let frame: unknown
      try {
        frame = JSON.parse(event.data)
      }
      catch {
        return
      }
      if (isCollabServerMessage(frame)) {
        client.receive(frame)
      }
    },
  })

  const state = shallowRef(client.state)
  const loaded = ref(client.loaded)
  const status = ref<CollabClientStatus>(client.status)
  const stops = [
    // `client.state` is updated in place, or replaced on a reset.
    client.on('change', () => {
      state.value = client.state
      triggerRef(state)
      status.value = client.status
    }),
    client.on('confirmed', () => {
      loaded.value = client.loaded
    }),
    client.on('status', (next) => {
      status.value = next
    }),
  ]
  const store = options.collection ? useNuxtApp().$rstore as CollabCacheStoreLike : undefined
  const unbind = store && bindCollabCache(store, client, { collection: options.collection! })

  watch(socket.status, (next) => {
    if (next === 'OPEN') {
      client.connect()
    }
    else {
      client.disconnect()
    }
  }, { immediate: true })

  onScopeDispose(() => {
    for (const stop of stops) {
      stop()
    }
    unbind?.()
    client.disconnect()
    socket.close()
  })

  return {
    client,
    state,
    loaded,
    status,
    connection: socket.status,
    submit: ops => client.submit(ops),
  }
}
