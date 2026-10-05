import { createMemoryOpLogStore } from '@rstore/multiplayer/server'

/**
 * Collab documents of the playground live in memory. A document opened for
 * the first time starts with one paragraph.
 */
export default defineNitroPlugin(() => {
  const store = createMemoryOpLogStore()
  const seeded = new Set<string>()
  defineRstoreCollab({
    store,
    hooks: {
      authorize: ({ docId }) => {
        if (!seeded.has(docId)) {
          seeded.add(docId)
          store.seed(docId, [{ id: `${docId}-p1`, docId, parentId: null, orderKey: 'a0', type: 'paragraph', attrs: {}, content: [], deleted: false, version: 0 }], 0)
        }
        return {}
      },
    },
  })
})
