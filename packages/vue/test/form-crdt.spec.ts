import { describe, expect, it, vi } from 'vitest'
import { createFormObject } from '../src'

describe('form CRDT rebase and conflicts', () => {
  it('should rebase form with no local changes', () => {
    const form = createFormObject({
      defaultValues: () => ({ title: 'Original', description: 'Desc' }),
      submit: async () => {},
    })

    // No local changes, rebase with new remote data
    form.$rebase({ title: 'Remote Title', description: 'Remote Desc' })

    expect(form.title).toBe('Remote Title')
    expect(form.description).toBe('Remote Desc')
    expect(form.$conflicts).toHaveLength(0)
  })

  it('should preserve local changes on non-conflicting fields after rebase', () => {
    const form = createFormObject({
      defaultValues: () => ({ title: 'Original', description: 'Desc', status: 'draft' }),
      submit: async () => {},
    })

    // Local change to title
    form.title = 'Local Title'

    // Remote change to description (no conflict)
    form.$rebase({ title: 'Original', description: 'New Desc', status: 'draft' })

    // Local change preserved
    expect(form.title).toBe('Local Title')
    // Remote change applied
    expect(form.description).toBe('New Desc')
    // Unchanged field stays the same
    expect(form.status).toBe('draft')
    expect(form.$conflicts).toHaveLength(0)
  })

  it('should detect conflicts when same field changed locally and remotely', () => {
    const form = createFormObject({
      defaultValues: () => ({ title: 'Original', description: 'Desc' }),
      submit: async () => {},
    })

    // Local change
    form.title = 'Local Title'

    // Remote also changed title
    form.$rebase({ title: 'Remote Title', description: 'Desc' })

    expect(form.$conflicts).toHaveLength(1)
    expect(form.$conflicts[0]!.field).toBe('title')
    expect(form.$conflicts[0]!.localValue).toBe('Local Title')
    expect(form.$conflicts[0]!.remoteValue).toBe('Remote Title')
    // Local value is kept until conflict is resolved
    expect(form.title).toBe('Local Title')
  })

  it('should resolve conflict with local value', () => {
    const form = createFormObject({
      defaultValues: () => ({ title: 'Original' }),
      submit: async () => {},
    })

    form.title = 'Local Title'
    form.$rebase({ title: 'Remote Title' })

    expect(form.$conflicts).toHaveLength(1)

    form.$resolveConflict('title', 'local')

    expect(form.title).toBe('Local Title')
    expect(form.$conflicts).toHaveLength(0)
  })

  it('should resolve conflict with remote value', () => {
    const form = createFormObject({
      defaultValues: () => ({ title: 'Original' }),
      submit: async () => {},
    })

    form.title = 'Local Title'
    form.$rebase({ title: 'Remote Title' })

    expect(form.$conflicts).toHaveLength(1)

    form.$resolveConflict('title', 'remote')

    // Remote value accepted (ops removed, rebuild from remote base)
    expect(form.title).toBe('Remote Title')
    expect(form.$conflicts).toHaveLength(0)
  })

  it('should fire $onConflict event', () => {
    const form = createFormObject({
      defaultValues: () => ({ title: 'Original' }),
      submit: async () => {},
    })

    const onConflict = vi.fn()
    form.$onConflict(onConflict)

    form.title = 'Local Title'
    form.$rebase({ title: 'Remote Title' })

    expect(onConflict).toHaveBeenCalledTimes(1)
    expect(onConflict).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ field: 'title' }),
      ]),
    )
  })

  it('should not fire $onConflict when there are no conflicts', () => {
    const form = createFormObject({
      defaultValues: () => ({ title: 'Original', description: 'Desc' }),
      submit: async () => {},
    })

    const onConflict = vi.fn()
    form.$onConflict(onConflict)

    form.title = 'Local Title'
    form.$rebase({ title: 'Original', description: 'New Desc' })

    expect(onConflict).not.toHaveBeenCalled()
  })

  it('should handle multiple rebases', () => {
    const form = createFormObject({
      defaultValues: () => ({ title: 'V1', count: 0 }),
      submit: async () => {},
    })

    // First local change
    form.title = 'Local'

    // First rebase (no conflict on title since it wasn't changed remotely)
    form.$rebase({ title: 'V1', count: 1 })
    expect(form.title).toBe('Local')
    expect(form.count).toBe(1)
    expect(form.$conflicts).toHaveLength(0)

    // Second rebase (still no conflict, remote changes count again)
    form.$rebase({ title: 'V1', count: 2 })
    expect(form.title).toBe('Local')
    expect(form.count).toBe(2)
    expect(form.$conflicts).toHaveLength(0)
  })

  it('should correctly track $changedProps after rebase', () => {
    const form = createFormObject({
      defaultValues: () => ({ title: 'Original', description: 'Desc' }),
      submit: async () => {},
    })

    form.title = 'Changed'
    form.$rebase({ title: 'Original', description: 'New Desc' })

    // title was changed locally relative to the new base
    expect(form.$hasChanges()).toBe(true)
    expect(form.$changedProps.title).toBeDefined()
  })

  it('should handle rebase with no changes at all', () => {
    const form = createFormObject({
      defaultValues: () => ({ title: 'Same' }),
      submit: async () => {},
    })

    // Rebase with same data
    form.$rebase({ title: 'Same' })

    expect(form.title).toBe('Same')
    expect(form.$conflicts).toHaveLength(0)
    expect(form.$hasChanges()).toBe(false)
  })

  it('should clear conflicts on $reset', async () => {
    const form = createFormObject({
      defaultValues: () => ({ title: 'Original' }),
      submit: async () => {},
    })

    form.title = 'Local'
    form.$rebase({ title: 'Remote' })
    expect(form.$conflicts).toHaveLength(1)

    await form.$reset()
    expect(form.$conflicts).toHaveLength(0)
  })

  it('should handle resolving multiple conflicts independently', () => {
    const form = createFormObject({
      defaultValues: () => ({ title: 'Original Title', description: 'Original Desc' }),
      submit: async () => {},
    })

    form.title = 'Local Title'
    form.description = 'Local Desc'
    form.$rebase({ title: 'Remote Title', description: 'Remote Desc' })

    expect(form.$conflicts).toHaveLength(2)

    // Resolve title with local
    form.$resolveConflict('title', 'local')
    expect(form.$conflicts).toHaveLength(1)
    expect(form.title).toBe('Local Title')

    // Resolve description with remote
    form.$resolveConflict('description', 'remote')
    expect(form.$conflicts).toHaveLength(0)
    expect(form.description).toBe('Remote Desc')
  })

  it('should detect conflict when remote changes field back to original value using remoteChangedFields', () => {
    const form = createFormObject({
      defaultValues: () => ({ title: 'Original', status: 'draft' }),
      submit: async () => {},
    })

    // Local user changes status
    form.status = 'published'

    // Remote user also changed status but sent it back to the original value.
    // Without the explicit remoteChangedFields hint, diffFields would see no change
    // (initialData.status === newBase.status === 'draft') and miss the conflict.
    form.$rebase({ title: 'Original', status: 'draft' }, ['status'])

    expect(form.$conflicts).toHaveLength(1)
    expect(form.$conflicts[0]!.field).toBe('status')
    expect(form.$conflicts[0]!.localValue).toBe('published')
    expect(form.$conflicts[0]!.remoteValue).toBe('draft')
    // Local value kept until resolved
    expect(form.status).toBe('published')
  })

  it('should fall back to diffFields when remoteChangedFields is not provided', () => {
    const form = createFormObject({
      defaultValues: () => ({ title: 'Original', status: 'draft' }),
      submit: async () => {},
    })

    // Local user changes status
    form.status = 'published'

    // Remote changes status to something different from initial → detected via diff
    form.$rebase({ title: 'Original', status: 'archived' })

    expect(form.$conflicts).toHaveLength(1)
    expect(form.$conflicts[0]!.field).toBe('status')
    expect(form.$conflicts[0]!.remoteValue).toBe('archived')
  })
})
