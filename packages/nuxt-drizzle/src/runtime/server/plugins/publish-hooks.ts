import { getHeader } from 'h3'
import { defineNitroPlugin } from 'nitropack/runtime'
import { rstoreDrizzleHooks } from '../utils/hooks'
import { publishRstoreDrizzleRealtimeUpdate } from '../utils/realtime'

/**
 * Name of the header used by the generated REST + batch API to tag the
 * originating browser tab. Kept in sync with the client-side constant in
 * `runtime/utils/client-id.ts`.
 */
const CLIENT_ID_HEADER = 'x-rstore-client-id'

export default defineNitroPlugin(() => {
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
})
