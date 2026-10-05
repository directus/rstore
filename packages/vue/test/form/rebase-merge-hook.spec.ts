import { createTestStore } from '#test-utils/store/integrationStore'
import { createFormObject } from '@rstore/vue'
import { describe, expect, it, vi } from 'vitest'

/**
 * A non-text merger: concurrent increments of a counter add up. Proves the
 * rebase is policy-free and replays whatever the merger returns.
 */
function counterMerge(payload: { field: string, base: unknown, local: unknown, remote: unknown, setMerged: (value: unknown) => void }) {
  if (typeof payload.base === 'number' && typeof payload.local === 'number' && typeof payload.remote === 'number') {
    payload.setMerged(payload.local + payload.remote - payload.base)
  }
}

describe('form field merge: standalone `fieldMerge` option', () => {
  it('replaces the local value, rewrites each set operation and replays them on undo/redo', () => {
    const fieldMerge = vi.fn(counterMerge)
    const form = createFormObject({
      defaultValues: () => ({ count: 10, title: 'Same' }),
      submit: async () => {},
      fieldMerge,
    })
    form.count = 11
    form.count = 12
    form.$rebase({ count: 15, title: 'Same' })

    expect(form.count).toBe(17)
    expect(form.$conflicts).toEqual([])
    expect(form.$opLog.getFieldOps('count')).toEqual([
      expect.objectContaining({ type: 'set', oldValue: 15, newValue: 16 }),
      expect.objectContaining({ type: 'set', oldValue: 16, newValue: 17 }),
    ])
    // Once for the field, then once per local set operation.
    expect(fieldMerge.mock.calls.map(([payload]) => [payload.field, payload.base, payload.local, payload.remote])).toEqual([
      ['count', 10, 12, 15],
      ['count', 10, 11, 15],
      ['count', 10, 12, 15],
    ])

    expect(form.$opLog.undo()).toBe(true)
    expect(form.count).toBe(16)
    expect(form.$opLog.undo()).toBe(true)
    expect(form.count).toBe(15)
    expect(form.$opLog.redo()).toBe(true)
    expect(form.count).toBe(16)
  })

  it('reports a conflict when the merger declines', () => {
    const form = createFormObject({
      defaultValues: () => ({ title: 'Base' }),
      submit: async () => {},
      fieldMerge: counterMerge,
    })
    form.title = 'Local'
    form.$rebase({ title: 'Remote' })

    expect(form.title).toBe('Local')
    expect(form.$conflicts).toEqual([{ field: 'title', localValue: 'Local', remoteValue: 'Remote' }])
  })
})

describe('form field merge: `formFieldMerge` store hook', () => {
  /** Store-backed update form of one counter row. */
  async function setup() {
    const store = await createTestStore({ schema: [{ name: 'counters' }], plugins: [] }) as any
    store.counters.writeItem({ id: '1', count: 10 })
    const form = await store.counters.updateForm('1')
    return { store, form }
  }

  it('uses the first handler that sets a merged value and skips the later ones', async () => {
    const { store, form } = await setup()
    const declining = vi.fn()
    const merging = vi.fn(counterMerge)
    const later = vi.fn((payload: any) => payload.setMerged(0))
    store.$hooks.hook('formFieldMerge', declining)
    store.$hooks.hook('formFieldMerge', merging)
    store.$hooks.hook('formFieldMerge', later)

    form.count = 12
    form.$rebase({ id: '1', count: 15 })

    expect(form.count).toBe(17)
    expect(declining).toHaveBeenCalledWith(expect.objectContaining({
      store,
      collection: store.$collections[0],
      field: 'count',
      base: 10,
      local: 12,
      remote: 15,
    }))
    expect(merging).toHaveBeenCalled()
    expect(later).not.toHaveBeenCalled()
  })

  it('reports a conflict when no handler sets a merged value', async () => {
    const { store, form } = await setup()
    store.$hooks.hook('formFieldMerge', () => {})
    form.count = 12
    form.$rebase({ id: '1', count: 15 })

    expect(form.count).toBe(12)
    expect(form.$conflicts).toEqual([{ field: 'count', localValue: 12, remoteValue: 15 }])
  })
})
