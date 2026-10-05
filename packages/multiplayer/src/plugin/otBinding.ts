import type { Cache, CacheLayer, ResolvedCollection } from '@rstore/shared'
import type { CollabClient } from '../ot/client.js'
import type { DocNodeRecord } from '../ot/types.js'
import { fieldValuesEqual } from '@rstore/shared'

/** The store parts the binding uses. */
export interface CollabCacheStoreLike {
  $cache: Cache<any, any>
  $collections: ResolvedCollection<any, any, any>[]
}

/** Options of {@link bindCollabCache}. */
export interface CollabCacheBindingOptions {
  /** Collection of the node rows (declared in `createMultiplayerPlugin({ ot })`). */
  collection: string
}

/** Records equal apart from the server version. */
function sameRecord(a: DocNodeRecord, b: DocNodeRecord | undefined): boolean {
  return a === b || (!!b && fieldValuesEqual({ ...a, version: 0 }, { ...b, version: 0 }))
}

/**
 * Mirrors a collab client into the rstore cache, so queries, relations and
 * forms read document nodes as plain rows:
 *
 * - confirmed nodes are committed rows (with their `version`, recorded in
 *   the `multiplayer:ot` item metadata by the plugin, which then drops
 *   realtime row frames that are not newer);
 * - pending local edits (in flight and buffered) live in the cache layer
 *   `multiplayer-ot:<docId>`, replaced on every change and removed when
 *   nothing is pending, like an optimistic mutation.
 *
 * @returns A function that stops mirroring and removes the layer.
 */
export function bindCollabCache(store: CollabCacheStoreLike, client: CollabClient, options: CollabCacheBindingOptions): () => void {
  const collection = store.$collections.find(c => c.name === options.collection)
  if (!collection) {
    throw new Error(`[rstore ot] unknown collection ${options.collection}`)
  }
  const cache = store.$cache
  const layerId = `multiplayer-ot:${client.docId}`

  /** Commits confirmed nodes (`null`: all of them). */
  const commit = (ids: string[] | null) => {
    const confirmed = client.confirmed
    if (!confirmed) {
      return
    }
    const nodes = ids ? ids.flatMap(id => confirmed.nodes.get(id) ?? []) : [...confirmed.nodes.values()]
    if (nodes.length) {
      cache.writeItems({ collection, items: nodes.map(node => ({ key: node.id, value: node as any })) })
    }
  }

  /** Puts the nodes whose local state differs from the confirmed one in the layer. */
  const refreshLayer = () => {
    const confirmed = client.confirmed
    const state: CacheLayer['state'] = {}
    for (const node of client.state.nodes.values()) {
      if (!confirmed || !sameRecord(node, confirmed.nodes.get(node.id))) {
        state[node.id] = node
      }
    }
    if (Object.keys(state).length) {
      cache.addLayer({ id: layerId, collectionName: collection.name, state, deletedItems: new Set(), optimistic: true })
    }
    else if (cache.getLayer(layerId)) {
      cache.removeLayer(layerId)
    }
  }

  commit(null)
  refreshLayer()
  const stops = [
    // An ack changes no local node but makes them match the confirmed ones.
    client.on('confirmed', ({ nodes }) => {
      commit(nodes)
      refreshLayer()
    }),
    client.on('change', refreshLayer),
  ]
  return () => {
    for (const stop of stops) {
      stop()
    }
    cache.removeLayer(layerId)
  }
}
