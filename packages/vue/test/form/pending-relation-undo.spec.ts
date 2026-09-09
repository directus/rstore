import { describe, expect, it } from 'vitest'
import { createHeldPostsForm } from '../utils/pendingRelationForm'

describe('form relation operations undone during a pending submit', () => {
  it('restores the targeted row of a to-many disconnect', async () => {
    const { form, gate, submitted, writePost, titles } = await createHeldPostsForm()
    writePost('post-1', 'user-1')
    writePost('post-2', 'user-1')
    expect(titles()).toEqual(['First', 'Second'])

    form.posts.$disconnect({ id: 'post-2' })
    expect(titles()).toEqual(['First'])

    const pending = form.$submit()
    expect(form.$opLog.undo()).toBe(true)
    expect(titles()).toEqual(['First', 'Second'])
    gate.resolve()
    await pending

    expect(submitted[0]!.operations).toEqual([
      expect.objectContaining({ field: 'posts', type: 'disconnect', oldValue: { id: 'post-2' } }),
    ])
    // The backend applied the disconnect, so the acknowledged data holds the
    // untouched row only; the undo survives as a connect of the targeted row.
    expect(titles()).toEqual(['First', 'Second'])
    expect(form.$opLog.getOptimized()).toEqual([
      expect.objectContaining({ field: 'posts', type: 'connect', newValue: { id: 'post-2' } }),
    ])

    await form.$submit()
    expect(submitted[1]!.operations).toEqual([
      expect.objectContaining({ field: 'posts', type: 'connect', newValue: { id: 'post-2' } }),
    ])
    expect(titles()).toEqual(['First', 'Second'])
    expect(form.$opLog.getAll()).toEqual([])
    expect(form.$hasChanges()).toBe(false)
  })

  it('restores every row of a to-many disconnect-all', async () => {
    const { form, gate, submitted, writePost, titles } = await createHeldPostsForm()
    writePost('post-1', 'other')
    writePost('post-2', 'other')
    form.posts.$connect({ id: 'post-1' })
    form.posts.$connect({ id: 'post-2' })
    expect(titles()).toEqual(['First', 'Second'])

    form.posts.$disconnect()
    expect(form.posts.$value).toEqual([])

    const pending = form.$submit()
    expect(form.$opLog.undo()).toBe(true)
    expect(titles()).toEqual(['First', 'Second'])
    gate.resolve()
    await pending

    expect(submitted[0]!.operations).toEqual([
      expect.objectContaining({ field: 'posts', type: 'disconnect', oldValue: [{ id: 'post-1' }, { id: 'post-2' }] }),
    ])
    // Every row the disconnect-all removed comes back, in its original order.
    expect(titles()).toEqual(['First', 'Second'])
    const restoredConnects = [
      expect.objectContaining({ field: 'posts', type: 'connect', newValue: { id: 'post-1' } }),
      expect.objectContaining({ field: 'posts', type: 'connect', newValue: { id: 'post-2' } }),
    ]
    expect(form.$opLog.getOptimized()).toEqual(restoredConnects)

    await form.$submit()
    expect(submitted[1]!.operations).toEqual(restoredConnects)
    expect(titles()).toEqual(['First', 'Second'])
    expect(form.$opLog.getAll()).toEqual([])
    expect(form.$hasChanges()).toBe(false)
  })

  it('restores a direct relation payload assignment', async () => {
    const { form, gate, submitted, writePost, titles } = await createHeldPostsForm()
    writePost('post-1', 'user-1')
    writePost('post-2', 'user-1')

    form.posts = [{ id: 'post-3', title: 'Draft' }]
    expect(form.$getRawData().posts).toEqual([{ id: 'post-3', title: 'Draft' }])

    const pending = form.$submit()
    expect(form.$opLog.undo()).toBe(true)
    expect(form.$getRawData().posts).toBeUndefined()
    gate.resolve()
    await pending

    expect(submitted[0]!.data.posts).toEqual([{ id: 'post-3', title: 'Draft' }])
    // The backend linked the assigned row, so the acknowledged data holds it;
    // the undo survives as the inverse payload assignment, which the resolved
    // relation value ignores the way the assignment itself did.
    expect(titles()).toEqual(['First', 'Second', 'Draft'])
    expect(form.$getRawData().posts).toBeUndefined()
    const inversePayloadSet = [
      expect.objectContaining({
        field: 'posts',
        type: 'set',
        newValue: undefined,
        oldValue: [{ id: 'post-3', title: 'Draft' }],
      }),
    ]
    expect(form.$opLog.getOptimized()).toEqual(inversePayloadSet)

    await form.$submit()
    expect(submitted[1]!.operations).toEqual(inversePayloadSet)
    expect(submitted[1]!.data.posts).toBeUndefined()
    expect(titles()).toEqual(['First', 'Second'])
    expect(form.$opLog.getAll()).toEqual([])
    expect(form.$hasChanges()).toBe(false)
  })
})
