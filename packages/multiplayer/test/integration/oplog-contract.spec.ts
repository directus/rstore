import { describeOpLogStoreContract } from '#test-utils/collab/opLogStoreContract'
import { createMemoryOpLogStore } from '@rstore/multiplayer/server'

describeOpLogStoreContract('createMemoryOpLogStore', async (retention) => {
  let now = 0
  const store = createMemoryOpLogStore({ retention, now: () => now })
  return {
    store,
    seed: async (docId, nodes, version) => store.seed(docId, nodes, version),
    setNow: (value) => {
      now = value
    },
  }
})
