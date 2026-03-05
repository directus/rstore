import { describe, expect, it, vi } from 'vitest'
import { createAwarenessHelper } from '../src/awareness'

function createMockAwareness() {
  let localState: Record<string, any> | null = {}
  const states = new Map<number, Record<string, any>>()
  const listeners = new Map<string, Set<(...args: any[]) => void>>()

  states.set(1, localState!)

  return {
    clientID: 1,
    getLocalState: () => localState,
    setLocalState: (state: Record<string, any> | null) => {
      localState = state
      if (state) {
        states.set(1, state)
      }
      else {
        states.delete(1)
      }
    },
    getStates: () => states,
    on: (event: string, handler: (...args: any[]) => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set())
      }
      listeners.get(event)!.add(handler)
    },
    off: (event: string, handler: (...args: any[]) => void) => {
      listeners.get(event)?.delete(handler)
    },
    _emit: (event: string, ...args: any[]) => {
      listeners.get(event)?.forEach(fn => fn(...args))
    },
    _listeners: listeners,
  }
}

describe('createAwarenessHelper', () => {
  it('should set user info', () => {
    const mockAwareness = createMockAwareness()
    const helper = createAwarenessHelper(mockAwareness as any)

    helper.setUser({ name: 'Alice', color: '#ff0000' })

    const state = mockAwareness.getLocalState()
    expect(state).toEqual({
      user: { name: 'Alice', color: '#ff0000' },
    })
  })

  it('should preserve existing state when setting user', () => {
    const mockAwareness = createMockAwareness()
    mockAwareness.setLocalState({ custom: 'data' })

    const helper = createAwarenessHelper(mockAwareness as any)
    helper.setUser({ name: 'Bob' })

    expect(mockAwareness.getLocalState()).toEqual({
      custom: 'data',
      user: { name: 'Bob' },
    })
  })

  it('should set cursor state', () => {
    const mockAwareness = createMockAwareness()
    const helper = createAwarenessHelper(mockAwareness as any)

    helper.setCursor({ collection: 'posts', key: '1', field: 'title' })

    expect(mockAwareness.getLocalState()).toEqual({
      cursor: { collection: 'posts', key: '1', field: 'title' },
    })
  })

  it('should clear cursor with null', () => {
    const mockAwareness = createMockAwareness()
    const helper = createAwarenessHelper(mockAwareness as any)

    helper.setCursor({ collection: 'posts', key: '1' })
    helper.setCursor(null)

    expect(mockAwareness.getLocalState()?.cursor).toBeNull()
  })

  it('should set arbitrary local state', () => {
    const mockAwareness = createMockAwareness()
    const helper = createAwarenessHelper(mockAwareness as any)

    helper.setLocalState({ editing: true, documentId: 'abc' })

    expect(mockAwareness.getLocalState()).toEqual({
      editing: true,
      documentId: 'abc',
    })
  })

  it('should get all states', () => {
    const mockAwareness = createMockAwareness()
    const states = mockAwareness.getStates()
    states.set(2, { user: { name: 'Charlie' } })

    const helper = createAwarenessHelper(mockAwareness as any)
    const allStates = helper.getStates()

    expect(allStates.size).toBe(2)
    expect(allStates.get(2)).toEqual({ user: { name: 'Charlie' } })
  })

  it('should get local state', () => {
    const mockAwareness = createMockAwareness()
    mockAwareness.setLocalState({ user: { name: 'Dave' } })

    const helper = createAwarenessHelper(mockAwareness as any)
    expect(helper.getLocalState()).toEqual({ user: { name: 'Dave' } })
  })

  it('should expose clientID', () => {
    const mockAwareness = createMockAwareness()
    const helper = createAwarenessHelper(mockAwareness as any)

    expect(helper.clientID).toBe(1)
  })

  it('should subscribe and unsubscribe to changes', () => {
    const mockAwareness = createMockAwareness()
    const helper = createAwarenessHelper(mockAwareness as any)

    const callback = vi.fn()
    const unsubscribe = helper.onChange(callback)

    const changes = { added: [2], updated: [], removed: [] }
    mockAwareness._emit('change', changes)

    expect(callback).toHaveBeenCalledWith(changes)

    unsubscribe()

    mockAwareness._emit('change', { added: [3], updated: [], removed: [] })
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('should expose the raw awareness instance', () => {
    const mockAwareness = createMockAwareness()
    const helper = createAwarenessHelper(mockAwareness as any)

    expect(helper.raw).toBe(mockAwareness)
  })
})
