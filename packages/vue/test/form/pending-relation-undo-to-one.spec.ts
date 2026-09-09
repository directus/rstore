import { describe, expect, it } from 'vitest'
import { createHeldProfileForm } from '../utils/pendingRelationForm'

/** Row the relation holds before the edit, as the restored operation names it. */
const previousProfile = { id: 'profile-1', bio: 'First' }

describe('undo of a to-one relation operation during a pending submit', () => {
  it.each([
    ['connect', (form: any) => form.profile.$connect({ id: 'profile-2' })],
    ['set', (form: any) => form.profile.$set([{ id: 'profile-2' }])],
  ])('restores the previously related row after an undone %s', async (_operation, edit) => {
    const { form, gate, submitted, writeProfile, savedProfileId } = await createHeldProfileForm({ profileId: 'profile-1' })
    writeProfile('profile-1', 'First')
    writeProfile('profile-2', 'Second')
    expect([form.profileId, form.profile.$value.bio]).toEqual(['profile-1', 'First'])

    edit(form)
    expect([form.profileId, form.profile.$value.bio]).toEqual(['profile-2', 'Second'])

    const pending = form.$submit()
    expect(form.$opLog.undo()).toBe(true)
    expect([form.profileId, form.profile.$value.bio]).toEqual(['profile-1', 'First'])
    gate.resolve()
    await pending

    // The connector-visible payload keeps its shape: the submit asked for the
    // row the user picked, named the way the user named it.
    expect(submitted[0]!.operations).toEqual([
      expect.objectContaining({ field: 'profile', type: 'connect', newValue: { id: 'profile-2' } }),
    ])
    expect(submitted[0]!.data.profileId).toBe('profile-2')
    // The backend saved that row, and the undo survives as a connect of the row
    // the relation held before the edit.
    expect(savedProfileId()).toBe('profile-2')
    expect([form.profileId, form.profile.$value.bio]).toEqual(['profile-1', 'First'])
    expect(form.$changedProps).toEqual({ profileId: ['profile-1', 'profile-2'] })
    const restoredConnect = [
      expect.objectContaining({ field: 'profile', type: 'connect', newValue: previousProfile, oldValue: undefined }),
    ]
    expect(form.$opLog.getOptimized()).toEqual(restoredConnect)

    await form.$submit()
    expect(submitted[1]!.operations).toEqual(restoredConnect)
    expect(submitted[1]!.data.profileId).toBe('profile-1')
    expect(savedProfileId()).toBe('profile-1')
    expect([form.profileId, form.profile.$value.bio]).toEqual(['profile-1', 'First'])
    expect(form.$opLog.getAll()).toEqual([])
    expect(form.$hasChanges()).toBe(false)
  })

  it('restores a foreign key the cache holds no row for', async () => {
    const { form, gate, submitted, writeProfile, savedProfileId } = await createHeldProfileForm({ profileId: 'profile-0' })
    writeProfile('profile-2', 'Second')
    // Nothing resolves the starting relation, but its foreign key is set.
    expect([form.profileId, form.profile.$value]).toEqual(['profile-0', null])

    form.profile.$connect({ id: 'profile-2' })
    const pending = form.$submit()
    expect(form.$opLog.undo()).toBe(true)
    expect(form.profileId).toBe('profile-0')
    gate.resolve()
    await pending

    expect(savedProfileId()).toBe('profile-2')
    // Without a row to name, the undo survives as an edit of the foreign key
    // the relation projects onto.
    expect(form.profileId).toBe('profile-0')
    const restoredKey = [
      expect.objectContaining({ field: 'profileId', type: 'set', newValue: 'profile-0', oldValue: 'profile-2' }),
    ]
    expect(form.$opLog.getOptimized()).toEqual(restoredKey)

    await form.$submit()
    expect(submitted[1]!.operations).toEqual(restoredKey)
    expect(savedProfileId()).toBe('profile-0')
    expect(form.profileId).toBe('profile-0')
    expect(form.$opLog.getAll()).toEqual([])
    expect(form.$hasChanges()).toBe(false)
  })

  it('keeps a redone connect applied', async () => {
    const { form, gate, submitted, writeProfile, savedProfileId } = await createHeldProfileForm({ profileId: 'profile-1' })
    writeProfile('profile-1', 'First')
    writeProfile('profile-2', 'Second')

    form.profile.$connect({ id: 'profile-2' })
    const pending = form.$submit()
    expect(form.$opLog.undo()).toBe(true)
    expect(form.profileId).toBe('profile-1')
    // Redo withdraws the undo, so the acknowledged connect stands.
    expect(form.$opLog.redo()).toBe(true)
    gate.resolve()
    await pending

    expect(submitted).toHaveLength(1)
    expect(savedProfileId()).toBe('profile-2')
    expect([form.profileId, form.profile.$value.bio]).toEqual(['profile-2', 'Second'])
    expect(form.$opLog.getAll()).toEqual([])
    expect(form.$hasChanges()).toBe(false)
  })
})
