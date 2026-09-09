import { createFormObject } from '@rstore/vue'
import { describe, expect, it } from 'vitest'

describe('form CRDT rebase and conflicts', () => {
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
