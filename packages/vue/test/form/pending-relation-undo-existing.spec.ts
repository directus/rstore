import { describe, expect, it } from 'vitest'
import { createHeldPostsForm } from '../utils/pendingRelationForm'

/** The two rows the form resolves from the cache, as the retry names them. */
const resolvedRows = [
  { id: 'post-1', authorId: 'user-1', title: 'First' },
  { id: 'post-2', authorId: 'user-1', title: 'Second' },
]

describe('undo of a whole-relation operation on cache-resolved rows', () => {
  it.each(['set', 'disconnect-all'] as const)('keeps cached and locally connected rows ordered after undo of %s', async (operation) => {
    const { form, gate, submitted, writePost, titles } = await createHeldPostsForm({ setMode: 'replace' })
    writePost('post-1', 'user-1')
    writePost('post-2', 'other')
    writePost('post-3', 'other')
    form.posts.$connect({ id: 'post-2' })
    expect(titles()).toEqual(['First', 'Second'])

    if (operation === 'set')
      form.posts.$set([{ id: 'post-3' }])
    else
      form.posts.$disconnect()
    const pending = form.$submit()
    expect(form.$opLog.undo()).toBe(true)
    expect(titles()).toEqual(['First', 'Second'])
    gate.resolve()
    await pending

    expect(titles()).toEqual(['First', 'Second'])
    await form.$submit()
    const operations = submitted[1]!.operations
    const restoredIds = operation === 'set'
      ? operations[0]!.newValue.map((item: any) => item.id)
      : operations.map(op => op.newValue.id)
    expect(restoredIds).toEqual(['post-1', 'post-2'])
    expect(titles()).toEqual(['First', 'Second'])
    expect(form.$hasChanges()).toBe(false)
  })

  it('restores the rows a to-many disconnect-all removed', async () => {
    const { form, gate, submitted, writePost, titles } = await createHeldPostsForm()
    writePost('post-1', 'user-1')
    writePost('post-2', 'user-1')
    // Both rows come from the cache, so neither is a local connect.
    expect(titles()).toEqual(['First', 'Second'])

    form.posts.$disconnect()
    expect(form.posts.$value).toEqual([])

    const pending = form.$submit()
    expect(form.$opLog.undo()).toBe(true)
    expect(titles()).toEqual(['First', 'Second'])
    gate.resolve()
    await pending

    // The connector-visible payload keeps its shape: a disconnect-all names no
    // row, because the form only ever recorded its locally connected ones.
    expect(submitted[0]!.operations).toEqual([
      expect.objectContaining({ field: 'posts', type: 'disconnect', newValue: [], oldValue: [] }),
    ])
    // The backend unlinked both rows, and the undo survives as a connect of
    // each row the user saw before the disconnect-all.
    expect(titles()).toEqual(['First', 'Second'])
    const restoredConnects = resolvedRows.map(row => expect.objectContaining({
      field: 'posts',
      type: 'connect',
      newValue: row,
      oldValue: undefined,
    }))
    expect(form.$opLog.getOptimized()).toEqual(restoredConnects)

    await form.$submit()
    expect(submitted[1]!.operations).toEqual(restoredConnects)
    expect(titles()).toEqual(['First', 'Second'])
    expect(form.$opLog.getAll()).toEqual([])
    expect(form.$hasChanges()).toBe(false)
  })

  it('restores the rows a to-many set replaced', async () => {
    const { form, gate, submitted, writePost, titles } = await createHeldPostsForm({ setMode: 'replace' })
    writePost('post-1', 'user-1')
    writePost('post-2', 'user-1')
    writePost('post-3', 'other')
    expect(titles()).toEqual(['First', 'Second'])

    form.posts.$set([{ id: 'post-3' }])
    expect(titles()).toEqual(['Draft'])

    const pending = form.$submit()
    expect(form.$opLog.undo()).toBe(true)
    expect(titles()).toEqual(['First', 'Second'])
    gate.resolve()
    await pending

    expect(submitted[0]!.operations).toEqual([
      expect.objectContaining({ field: 'posts', type: 'set', newValue: [{ id: 'post-3' }], oldValue: [] }),
    ])
    // The backend replaced the relation with the assigned row, and the undo
    // survives as a set naming the rows the user reverted to.
    expect(titles()).toEqual(['First', 'Second'])
    const restoredSet = [
      expect.objectContaining({
        field: 'posts',
        type: 'set',
        newValue: resolvedRows,
        oldValue: [{ id: 'post-3' }],
      }),
    ]
    expect(form.$opLog.getOptimized()).toEqual(restoredSet)

    await form.$submit()
    expect(submitted[1]!.operations).toEqual(restoredSet)
    expect(titles()).toEqual(['First', 'Second'])
    expect(form.$opLog.getAll()).toEqual([])
    expect(form.$hasChanges()).toBe(false)
  })

  it('keeps the row a duplicate connect named related', async () => {
    const { form, gate, submitted, writePost, titles } = await createHeldPostsForm()
    writePost('post-1', 'user-1')
    // The row is already related through the cache, so connecting it again
    // shows it twice and undoing that connect must not unlink it.
    expect(titles()).toEqual(['First'])
    form.posts.$connect({ id: 'post-1' })
    expect(titles()).toEqual(['First', 'First'])

    const pending = form.$submit()
    expect(form.$opLog.undo()).toBe(true)
    expect(titles()).toEqual(['First'])
    gate.resolve()
    await pending

    expect(submitted[0]!.operations).toEqual([
      expect.objectContaining({ field: 'posts', type: 'connect', newValue: { id: 'post-1' } }),
    ])
    expect(titles()).toEqual(['First'])
    expect(form.$opLog.getAll()).toEqual([])
    expect(form.$hasChanges()).toBe(false)
  })

  it('keeps an edit made after the undo on top of the restored rows', async () => {
    const { form, gate, submitted, writePost, titles } = await createHeldPostsForm()
    writePost('post-1', 'user-1')
    writePost('post-2', 'user-1')
    writePost('post-3', 'other')

    form.posts.$disconnect()
    const pending = form.$submit()
    expect(form.$opLog.undo()).toBe(true)
    // The edit made while the submit is pending stays on top of the undo.
    form.posts.$connect({ id: 'post-3' })
    expect(titles()).toEqual(['First', 'Second', 'Draft'])
    gate.resolve()
    await pending

    expect(titles()).toEqual(['First', 'Second', 'Draft'])
    expect(form.$opLog.getOptimized()).toEqual([
      ...resolvedRows.map(row => expect.objectContaining({ field: 'posts', type: 'connect', newValue: row })),
      expect.objectContaining({ field: 'posts', type: 'connect', newValue: { id: 'post-3' } }),
    ])

    await form.$submit()
    expect(submitted[1]!.operations).toHaveLength(3)
    expect(titles()).toEqual(['First', 'Second', 'Draft'])
    expect(form.$opLog.getAll()).toEqual([])
  })

  it('keeps a redone disconnect-all applied', async () => {
    const { form, gate, submitted, writePost, titles } = await createHeldPostsForm()
    writePost('post-1', 'user-1')
    writePost('post-2', 'user-1')

    form.posts.$disconnect()
    const pending = form.$submit()
    expect(form.$opLog.undo()).toBe(true)
    expect(titles()).toEqual(['First', 'Second'])
    // Redo withdraws the undo, so the acknowledged disconnect-all stands.
    expect(form.$opLog.redo()).toBe(true)
    gate.resolve()
    await pending

    expect(submitted).toHaveLength(1)
    expect(form.posts.$value).toEqual([])
    expect(form.$opLog.getAll()).toEqual([])
    expect(form.$hasChanges()).toBe(false)
  })
})
