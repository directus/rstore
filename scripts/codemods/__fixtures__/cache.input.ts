declare const store: any
declare const collection: any
declare const stamps: any
declare const fieldTimestamps: any
declare const form: any

store.$cache.writeItem({ collection, key: 1, item: {}, fieldTimestamps: stamps })
store.$cache.writeItem({ collection, key: 1, item: {}, fieldTimestamps })
store.$cache.deleteItem({ collection, key: 1, deletedAt: '0000000005dc:0000:server' })
store.$cache.applyMutation({ collection, mutation: 'delete', key: 1, deletedAt: 1 })
store.$cache.readItem({ collection, key: 1, fieldTimestamps: stamps })

export const created = createStore({
  schema: [],
  tombstoneGc: { intervalMs: 1000 },
  plugins: [],
})

for (const conflict of form.$conflicts) {
  console.log(conflict.localTimestamp, conflict.remoteTimestamp)
}

declare function createStore(options: any): any
