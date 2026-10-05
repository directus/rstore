import type { MultiplayerPluginOptions } from '@rstore/multiplayer'
import { createTestStore } from '#test-utils/store/integrationStore'
import { createMultiplayerPlugin } from '@rstore/multiplayer'
import { describe, expect, it } from 'vitest'

/** Update form of one document, on a store using the plugin. */
async function setup(options: MultiplayerPluginOptions = {}) {
  const store = await createTestStore({
    schema: [{ name: 'documents' }],
    plugins: [createMultiplayerPlugin({ tombstoneGc: false, ...options })],
  }) as any
  store.documents.writeItem({ id: '1', body: 'Hello world', count: 1 })
  return store.documents.updateForm('1')
}

describe('createMultiplayerPlugin: form text merge', () => {
  it('merges non-overlapping text edits during $rebase', async () => {
    const form = await setup()
    form.body = 'Hello brave world'
    form.$rebase({ id: '1', body: 'Hello world!', count: 1 })

    expect(form.body).toBe('Hello brave world!')
    expect(form.$conflicts).toEqual([])
  })

  it('leaves overlapping text edits and non-text fields as conflicts', async () => {
    const form = await setup()
    form.body = 'Hello planet'
    form.count = 2
    form.$rebase({ id: '1', body: 'Hello there', count: 3 })

    expect(form.$conflicts).toEqual([
      { field: 'body', localValue: 'Hello planet', remoteValue: 'Hello there' },
      { field: 'count', localValue: 2, remoteValue: 3 },
    ])
  })

  it('registers no merger with formTextMerge: false', async () => {
    const form = await setup({ formTextMerge: false })
    form.body = 'Hello brave world'
    form.$rebase({ id: '1', body: 'Hello world!', count: 1 })

    expect(form.$conflicts).toEqual([{ field: 'body', localValue: 'Hello brave world', remoteValue: 'Hello world!' }])
  })
})
