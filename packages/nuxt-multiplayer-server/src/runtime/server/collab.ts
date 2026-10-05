import type { CollabPeer, CollabServer, CollabServerOptions, OpLogStore } from '@rstore/multiplayer/server'
import type { Peer } from 'crossws'
import { createCollabServer, createMemoryOpLogStore } from '@rstore/multiplayer/server'

/** Peer given to the collab hooks: `ws` is the crossws peer (with its upgrade `request`). */
export interface RstoreCollabPeer extends CollabPeer {
  ws: Peer
}

/** Options of {@link defineRstoreCollab}. */
export interface RstoreCollabOptions extends Omit<CollabServerOptions<RstoreCollabPeer>, 'store'> {
  /**
   * Op log and node rows. Use a database store in production
   * (`createDrizzleOpLogStore` from `@rstore/nuxt-drizzle/collab`, or your own).
   * @default an in-memory store (lost on restart, single process)
   */
  store?: OpLogStore
}

let collabOptions: RstoreCollabOptions = {}
let collabServer: CollabServer<RstoreCollabPeer> | undefined

/**
 * Configures the collab sequencer of the multiplayer endpoint (module option
 * `collab`). Call it from a Nitro plugin, before clients connect:
 *
 * ```ts
 * export default defineNitroPlugin(() => {
 *   defineRstoreCollab({
 *     store: createDrizzleOpLogStore({ db, tables }),
 *     hooks: { authorize: async ({ peer, docId }) => ({ userId: await userFrom(peer.ws.request) }) },
 *   })
 * })
 * ```
 *
 * Calling it again replaces the sequencer (connected documents must reopen).
 */
export function defineRstoreCollab(options: RstoreCollabOptions): void {
  collabOptions = options
  collabServer = undefined
}

/** The collab sequencer, for server-authored ops (`submitServer`) from API routes or jobs. */
export function useRstoreCollabServer(): CollabServer<RstoreCollabPeer> {
  if (!collabServer) {
    const store = collabOptions.store ?? createMemoryOpLogStore()
    collabOptions.store = store
    collabServer = createCollabServer<RstoreCollabPeer>({ ...collabOptions, store })
  }
  return collabServer
}
