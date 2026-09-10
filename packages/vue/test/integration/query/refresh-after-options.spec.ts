import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

/** Schema metadata arrives as a nested response, as in a workspace bootstrap. */
const schema = [
  {
    name: 'sources',
    relations: {
      collections: { many: true, to: { collections: { on: { sourceId: 'id' } } } },
    },
  },
  { name: 'collections' },
]

/** Independent network payload, with distinct names for each workspace. */
function sourceResponse(workspace: string) {
  return [{
    id: `source-${workspace}`,
    apiName: workspace,
    collections: [{ id: `collection-${workspace}`, sourceId: `source-${workspace}`, apiName: `${workspace}_album` }],
  }]
}

describe('refresh after reactive options change', () => {
  it.each([null, 'previous'])('exposes fetched schema when refresh resolves after leaving %s', async (previousWorkspace) => {
    const workspace = ref<string | null>(previousWorkspace)
    const stack = await createVueStack({
      schema,
      experimentalGarbageCollection: true,
      remote: false,
      plugins: [{
        name: 'schema-response',
        setup({ hook }) {
          hook('fetchMany', async ({ collection, setResult }) => {
            if (collection.name === 'sources') {
              setResult(sourceResponse(workspace.value!))
            }
          })
        },
      }],
    })
    const query = await stack.run(() => stack.store.sources.query((q: any) => q.many(workspace.value
      ? { params: { workspace: workspace.value }, include: { collections: true } }
      : { enabled: false })))
    expect(query.data.value.map((source: any) => source.apiName)).toEqual(previousWorkspace ? [previousWorkspace] : [])

    workspace.value = 'current'
    for (const collection of stack.store.$collections) {
      stack.cache.clearCollection({ collection })
    }
    await query.refresh()
    // A bootstrap caller consumes this value immediately; later reactivity cannot
    // repair a snapshot skipped because the awaited refresh returned no rows.
    const sourcesAtRefresh = query.data.value.map((source: any) => ({
      apiName: source.apiName,
      collections: source.collections.map((collection: any) => collection.apiName),
    }))

    // Positive control: the response really reaches the cache, even on the bug.
    await vi.waitFor(() => expect(stack.store.collections.peekMany().map((collection: any) => collection.apiName)).toEqual(['current_album']))
    expect(sourcesAtRefresh).toEqual([{ apiName: 'current', collections: ['current_album'] }])
  })
})
