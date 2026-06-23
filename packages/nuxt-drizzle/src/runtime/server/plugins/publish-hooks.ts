import process from 'node:process'
import { createHLCClock, setDefaultClock } from '@rstore/core'
import { getHeader } from 'h3'
import { defineNitroPlugin } from 'nitropack/runtime'
import { closeAllRstoreDrizzlePeers } from '../api/realtime.ws'
import { CLIENT_ID_HEADER } from '../realtime/utils/protocol'
import { rstoreDrizzleHooks } from '../utils/hooks'
import { publishRstoreDrizzleRealtimeUpdate } from '../utils/realtime'

/**
 * Install a dedicated server HLC so every realtime publish gets a
 * deterministically-ordered timestamp. A stable `nodeId` (from
 * `RSTORE_DRIZZLE_NODE_ID`, falling back to a process-bound random) keeps
 * tiebreaks consistent across in-flight frames within the same process.
 */
function installServerHLC() {
  const nodeId = process.env.RSTORE_DRIZZLE_NODE_ID
    ?? `rstore-drizzle:${Math.random().toString(16).slice(2, 10)}`
  setDefaultClock(createHLCClock(nodeId))
}

export default defineNitroPlugin((nitroApp) => {
  installServerHLC()

  rstoreDrizzleHooks.hook('index.post.after', async ({ event, collection, result }) => {
    publishRstoreDrizzleRealtimeUpdate({
      type: 'created',
      collection,
      record: result,
      originClientId: getHeader(event, CLIENT_ID_HEADER),
    })
  })

  rstoreDrizzleHooks.hook('item.patch.after', async ({ event, collection, key, result }) => {
    publishRstoreDrizzleRealtimeUpdate({
      type: 'updated',
      collection,
      key,
      record: result,
      originClientId: getHeader(event, CLIENT_ID_HEADER),
    })
  })

  rstoreDrizzleHooks.hook('item.delete.after', async ({ event, collection, key, result }) => {
    publishRstoreDrizzleRealtimeUpdate({
      type: 'deleted',
      collection,
      key,
      record: result,
      originClientId: getHeader(event, CLIENT_ID_HEADER),
    })
  })

  // Force-close every realtime peer when Nitro shuts down. Node's
  // `server.closeAllConnections()` (called by the dev worker) skips upgraded
  // WebSocket sockets, so the subsequent `listener.close()` would otherwise
  // hang waiting for sockets that the browser keeps alive via auto-reconnect
  // — that is exactly what causes `nuxt dev` to freeze on config-change
  // restarts. Closing the peers ourselves lets `listener.close()` settle.
  nitroApp.hooks.hook('close', () => {
    closeAllRstoreDrizzlePeers()
  })
})
