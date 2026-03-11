import { defineNitroPlugin } from 'nitropack/runtime'
import { rstoreDrizzleHooks } from '../utils/hooks'
import { publishRstoreDrizzleRealtimeUpdate } from '../utils/realtime'

export default defineNitroPlugin(() => {
  // function applyRealtimeFilterHooks<TType extends 'created' | 'updated' | 'deleted'>(payload: Pick<RstoreDrizzleRealtimeFilterPayload<any, TType>, 'collection' | 'key' | 'record' | 'type'>): Promise<boolean> {
  //   return new Promise<boolean>((resolve) => {
  //     let accepted = 0
  //     const length = rstoreDrizzleHooks.hookLength('realtime.filter')
  //     rstoreDrizzleHooks.callHook('realtime.filter', {
  //       ...payload,
  //       accept: () => {
  //         accepted++
  //       },
  //     }).then(() => {
  //       resolve(accepted === length)
  //     })
  //   })
  // }

  rstoreDrizzleHooks.hook('index.post.after', async ({ collection, result }) => {
    publishRstoreDrizzleRealtimeUpdate({
      type: 'created',
      collection,
      record: result,
    })
  })

  rstoreDrizzleHooks.hook('item.patch.after', async ({ collection, key, result }) => {
    publishRstoreDrizzleRealtimeUpdate({
      type: 'updated',
      collection,
      key,
      record: result,
    })
  })

  rstoreDrizzleHooks.hook('item.delete.after', async ({ collection, key, result }) => {
    publishRstoreDrizzleRealtimeUpdate({
      type: 'deleted',
      collection,
      key,
      record: result,
    })
  })
})
