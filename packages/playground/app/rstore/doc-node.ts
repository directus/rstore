import type { DocNodeRecord } from '@rstore/multiplayer/ot'

/**
 * Blocks of the collab documents (`/doc/:id`). Filled by
 * `useRstoreCollabDocument`, never fetched: the collection has no `path`.
 */
export default withItemType<DocNodeRecord>().defineCollection({
  name: 'DocNode',
})
