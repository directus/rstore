import { createDeferred } from '#test-utils/deferred'
import { createFormObject } from '@rstore/vue'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { nextTick } from 'vue'
import { createRelationStack } from '../utils/relationStore'

describe('form state across pending work', () => {
  it.each(['reset', 'undo', 'clear'] as const)('keeps newer edits after %s during submit', async (action) => {
    const gate = createDeferred<void>()
    onTestFinished(() => gate.resolve())
    let saved = 'John'
    const form = createFormObject({
      defaultValues: () => ({ name: saved }),
      submit: async (data) => {
        saved = data.name!
        await gate.promise
      },
    })
    form.name = 'Jane'
    const pending = form.$submit()
    await nextTick()
    if (action === 'reset')
      await form.$reset()
    else if (action === 'undo')
      form.$opLog.undo()
    else
      form.$opLog.clear()
    form.name = 'Janet'
    gate.resolve()
    await pending
    expect(form.name).toBe('Janet')
    expect(form.$changedProps).toEqual({ name: ['Janet', 'Jane'] })
    expect(form.$opLog.getOptimized()).toEqual([
      expect.objectContaining({ field: 'name', newValue: 'Janet', oldValue: 'Jane' }),
    ])
    await form.$submit()
    expect(saved).toBe('Janet')
    expect(form.$hasChanges()).toBe(false)
  })

  it('keeps an undo of the submitted edit after acknowledgement', async () => {
    const gate = createDeferred<void>()
    onTestFinished(() => gate.resolve())
    let saved = 'John'
    const submittedOperations: any[] = []
    const form = createFormObject({
      defaultValues: () => ({ name: saved }),
      resetDefaultValues: () => ({ name: saved }),
      submit: async (data, { formOperations }) => {
        submittedOperations.push(formOperations)
        await gate.promise
        saved = data.name!
      },
    })
    form.name = 'Jane'
    const pending = form.$submit()
    await nextTick()
    expect(form.$opLog.undo()).toBe(true)
    expect(form.name).toBe('John')
    gate.resolve()
    await pending
    expect(saved).toBe('Jane')
    expect(form.name).toBe('John')
    expect(form.$changedProps).toEqual({ name: ['John', 'Jane'] })
    expect(form.$hasChanges()).toBe(true)
    expect(form.$opLog.getOptimized()).toEqual([
      expect.objectContaining({ field: 'name', type: 'set', newValue: 'John', oldValue: 'Jane' }),
    ])
    await form.$submit()
    expect(submittedOperations[1]).toEqual([
      expect.objectContaining({ field: 'name', type: 'set', newValue: 'John', oldValue: 'Jane' }),
    ])
    expect(saved).toBe('John')
    expect(form.name).toBe('John')
    expect(form.$hasChanges()).toBe(false)
  })

  it('keeps the redone position of submitted edits after acknowledgement', async () => {
    const gate = createDeferred<void>()
    onTestFinished(() => gate.resolve())
    let saved = 'John'
    const form = createFormObject({
      defaultValues: () => ({ name: saved }),
      resetDefaultValues: () => ({ name: saved }),
      submit: async (data) => {
        await gate.promise
        saved = data.name!
      },
    })
    form.name = 'Jane'
    form.name = 'Janet'
    const pending = form.$submit()
    await nextTick()
    form.$opLog.undo()
    form.$opLog.undo()
    expect(form.name).toBe('John')
    expect(form.$opLog.redo()).toBe(true)
    expect(form.name).toBe('Jane')
    gate.resolve()
    await pending
    expect(saved).toBe('Janet')
    expect(form.name).toBe('Jane')
    expect(form.$changedProps).toEqual({ name: ['Jane', 'Janet'] })
    expect(form.$opLog.getOptimized()).toEqual([
      expect.objectContaining({ field: 'name', type: 'set', newValue: 'Jane', oldValue: 'Janet' }),
    ])
    await form.$submit()
    expect(saved).toBe('Jane')
    expect(form.$hasChanges()).toBe(false)
  })

  it('keeps undone relation connects as pending disconnects after acknowledgement', async () => {
    const gate = createDeferred<void>()
    onTestFinished(() => gate.resolve())
    const stack = await createRelationStack()
    stack.write('profiles', { id: 'profile-1', bio: 'Hello' })
    stack.write('posts', { id: 'post-2', authorId: 'other', title: 'Connected' })
    const submittedOperations: any[] = []
    let savedProfileId: string | null = null
    const form = createFormObject({
      defaultValues: () => ({ id: 'user-1', profileId: savedProfileId }),
      validateOnSubmit: false,
      submit: async (data, { formOperations }) => {
        submittedOperations.push(formOperations)
        await gate.promise
        savedProfileId = data.profileId ?? null
      },
      ...stack.formBase,
    }) as any
    form.profile.$connect({ id: 'profile-1' })
    form.posts.$connect({ id: 'post-2' })
    expect(form.profile.$value.bio).toBe('Hello')
    const pending = form.$submit()
    await nextTick()
    form.$opLog.undo()
    form.$opLog.undo()
    gate.resolve()
    await pending
    expect(savedProfileId).toBe('profile-1')
    expect(form.profileId).toBeNull()
    expect(form.profile.$value).toBeNull()
    expect(form.$changedProps).toEqual({ profileId: [null, 'profile-1'] })
    const optimized = form.$opLog.getOptimized()
    expect(optimized).toHaveLength(2)
    expect(optimized).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'profile', type: 'disconnect', oldValue: { id: 'profile-1' } }),
      expect.objectContaining({ field: 'posts', type: 'disconnect', oldValue: { id: 'post-2' } }),
    ]))
    await form.$submit()
    expect(submittedOperations[1]).toEqual(optimized)
    expect(savedProfileId).toBeNull()
    expect(form.$hasChanges()).toBe(false)
  })

  it.each([true, false])('keeps latest validity when older validation is invalid: %s', async (olderInvalid) => {
    const gate = createDeferred<void>()
    onTestFinished(() => gate.resolve())
    const form = createFormObject({
      defaultValues: () => ({ name: 'initial' }),
      submit: async () => {},
      schema: { '~standard': {
        version: 1,
        vendor: 'test',
        validate: async (data: any) => {
          if (data.name === 'older')
            await gate.promise
          const invalid = data.name === (olderInvalid ? 'older' : 'newer')
          return invalid ? { issues: [{ message: 'invalid' }] } : { value: data }
        },
      } },
    })
    await nextTick()
    form.name = 'older'
    await nextTick()
    form.name = 'newer'
    await nextTick()
    await vi.waitFor(() => expect(form.$valid).toBe(olderInvalid))
    gate.resolve()
    await nextTick()
    await nextTick()
    expect(form.$valid).toBe(olderInvalid)
    form.name = 'recovered'
    await nextTick()
    await vi.waitFor(() => expect(form.$valid).toBe(true))
  })

  it.each([true, false])('tracks both submits when newer settles first: %s', async (newerFirst) => {
    const gates = [createDeferred<void>(), createDeferred<void>()]
    onTestFinished(() => gates.forEach(gate => gate.resolve()))
    let calls = 0
    const form = createFormObject({
      defaultValues: () => ({ name: 'initial' }),
      resetOnSuccess: false,
      submit: async () => gates[calls++]!.promise,
    })
    const first = form.$submit()
    const second = form.$submit()
    await nextTick()
    expect(calls).toBe(2)
    expect(form.$loading).toBe(true)
    const index = newerFirst ? 1 : 0
    gates[index]!.resolve()
    await [first, second][index]
    expect(form.$loading).toBe(true)
    gates[1 - index]!.resolve()
    await Promise.all([first, second])
    expect(form.$loading).toBe(false)
  })

  it('does not publish an older submit error after newer success', async () => {
    const gate = createDeferred<void>()
    onTestFinished(() => gate.resolve())
    let calls = 0
    const failure = new Error('older failed')
    const form = createFormObject({
      defaultValues: () => ({ name: 'initial' }),
      submit: async () => {
        if (++calls === 1) {
          await gate.promise
          throw failure
        }
      },
    })
    const first = form.$submit().catch(error => error)
    await form.$submit()
    gate.resolve()
    expect(await first).toBe(failure)
    expect(form.$error).toBeNull()
    expect(form.$loading).toBe(false)
  })

  it('ignores an older acknowledgement whose reset values arrive after a newer submit', async () => {
    const entered = createDeferred<void>()
    const gate = createDeferred<void>()
    onTestFinished(() => gate.resolve())
    let saved = 'initial'
    let resets = 0
    const form = createFormObject({
      defaultValues: () => ({ name: saved }),
      resetDefaultValues: async () => {
        const name = saved
        if (++resets === 1) {
          entered.resolve()
          await gate.promise
        }
        return { name }
      },
      submit: async (data) => { saved = data.name! },
    })
    form.name = 'older'
    const first = form.$submit()
    await entered.promise
    form.name = 'newer'
    await form.$submit()
    form.name = 'local'
    gate.resolve()
    await first
    expect(form.name).toBe('local')
    expect(form.$changedProps).toEqual({ name: ['local', 'newer'] })
  })

  it.each([false, true])('detaches nested submit data and operations (transform: %s)', async (transform) => {
    const gate = createDeferred<void>()
    onTestFinished(() => gate.resolve())
    let submitted: any
    let operations: any
    const form = createFormObject({
      defaultValues: () => ({ profile: { name: 'initial' } }),
      resetOnSuccess: false,
      transformData: transform ? data => ({ ...data }) : undefined,
      schema: { '~standard': {
        version: 1,
        vendor: 'test',
        validate: async (data: any) => {
          await gate.promise
          return { value: data }
        },
      } },
      submit: async (data, options) => {
        submitted = data
        operations = options.formOperations
      },
    })
    form.profile = { name: 'submitted' }
    const pending = form.$submit()
    form.profile.name = 'later'
    gate.resolve()
    await pending
    await nextTick()
    expect(submitted).toEqual({ profile: { name: 'submitted' } })
    expect(operations).toEqual([
      expect.objectContaining({ field: 'profile', newValue: { name: 'submitted' }, oldValue: { name: 'initial' } }),
    ])
    expect(form.profile.name).toBe('later')
  })
})
