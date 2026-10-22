import { createCoreStack } from '#test-utils/store/coreStack'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { executeAction } from '../src/actions'
import { CommandLedger } from '../src/actions/commands'
import { createRstoreDevtools } from '../src/runtime'

describe('command replay protection', () => {
  // Real mutation pipeline held at external DB fixture. Missing dedup dispatches twice.
  it('shares pending outcome and rejects conflicting reuse without duplicate backend effect', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const registration = runtime.attachStore(stack.store, { id: 'store' })
    const action = { target: registration.target, commandId: 'same', issuedAt: Date.now(), action: 'create-item', collection: 'todos', item: { id: 'one', title: 'Saved' } }
    const release = stack.remote.holdNext('createItem')
    const first = executeAction(runtime, action)
    const repeated = executeAction(runtime, { ...action, item: { title: 'Saved', id: 'one' } })
    try {
      await vi.waitFor(() => expect(stack.remote.callCount('createItem')).toBe(1))
      expect(stack.remote.rows('todos')).toEqual([])
      await expect(executeAction(runtime, { ...action, item: { id: 'two' } })).rejects.toMatchObject({ details: { code: 'COMMAND_CONFLICT' } })
    }
    finally { release() }
    expect(await repeated).toEqual(await first)
    expect(stack.remote.callCount('createItem')).toBe(1)
    expect(stack.remote.rows('todos')).toEqual([{ id: 'one', title: 'Saved' }])
    await executeAction(runtime, action)
    expect(stack.remote.callCount('createItem')).toBe(1)
  })

  it('isolates failed replay details from earlier consumers without retrying backend work', async () => {
    const stack = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }] })
    const runtime = createRstoreDevtools()
    onTestFinished(runtime.dispose)
    const registration = runtime.attachStore(stack.store, { id: 'store' })
    const action = { target: { ...registration.target }, commandId: 'failed-replay', issuedAt: Date.now(), action: 'create-item', collection: 'todos', item: { id: 'refused', title: 'No write' } }
    stack.remote.failNext('createItem', new Error('backend refused'))
    const first = await executeAction(runtime, action).catch(error => error)
    expect(first.details).toEqual({ code: 'BACKEND_FAILURE', target: registration.target, commandId: 'failed-replay', message: 'backend refused' })
    first.details.code = 'READ_ONLY'
    first.details.message = 'Tampered'
    first.details.target.storeId = 'other'
    const replay = await executeAction(runtime, action).catch(error => error)
    expect(replay.details).toEqual({ code: 'BACKEND_FAILURE', target: registration.target, commandId: 'failed-replay', message: 'backend refused' })
    expect(stack.remote.callCount('createItem')).toBe(1)
    expect(stack.remote.rows('todos')).toEqual([])
    expect(stack.read('todos', 'refused')).toBeUndefined()
  })

  // Real bounded retention algorithm with explicit clock; no global time replacement.
  it('preserves pending records, rejects capacity, expires settled records and invalid issue times', async () => {
    let now = 1000000
    const ledger = new CommandLedger(() => now, 2)
    let release!: () => void
    const held = new Promise<number>((resolve) => {
      release = () => resolve(7)
    })
    const pending = ledger.run('pending', now, 'one', () => held)
    await ledger.run('settled', now, 'two', () => Promise.resolve(8))
    expect(() => ledger.run('third', now, 'three', () => Promise.resolve(9))).toThrow(/capacity/i)
    now += 300001
    await expect(ledger.run('third', now, 'three', () => Promise.resolve(9))).resolves.toBe(9)
    expect(() => ledger.run('fourth', now, 'four', () => Promise.resolve(10))).toThrow(/capacity/i)
    release()
    expect(await pending).toBe(7)
    await expect(ledger.run('fourth', now, 'four', () => Promise.resolve(10))).resolves.toBe(10)
    expect(() => ledger.run('old', now - 300001, 'old', () => Promise.resolve(1))).toThrow(/expired/i)
    expect(() => ledger.run('future', now + 30001, 'future', () => Promise.resolve(1))).toThrow(/expired/i)
  })
})
