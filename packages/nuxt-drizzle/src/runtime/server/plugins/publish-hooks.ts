import { defineNitroPlugin } from 'nitropack/runtime'
import { rstoreDrizzleHooks } from '../utils/hooks'
import { getPubSub } from '../utils/pubsub'

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
    getPubSub().publish('update', {
      type: 'created',
      collection,
      key: undefined,
      record: result,
    })
  })

  rstoreDrizzleHooks.hook('item.patch.after', async ({ collection, key, result }) => {
    getPubSub().publish('update', {
      type: 'updated',
      collection,
      key,
      record: result,
    })
  })

  rstoreDrizzleHooks.hook('item.delete.after', async ({ collection, key, result }) => {
    getPubSub().publish('update', {
      type: 'deleted',
      collection,
      key,
      record: result,
    })
  })
})
