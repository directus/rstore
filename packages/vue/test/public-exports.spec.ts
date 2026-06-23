import { describe, expect, it } from 'vitest'
import {
  createFormObject,
  createStore,
  defineCollection,
  optimizeOpLog,
  realtimeReconnectEventHook,
} from '../src'

describe('public vue exports', () => {
  it('exports store, form, and event helpers from the package root', () => {
    expect(typeof createStore).toBe('function')
    expect(typeof defineCollection).toBe('function')
    expect(typeof createFormObject).toBe('function')
    expect(typeof realtimeReconnectEventHook.trigger).toBe('function')
    expect(optimizeOpLog([{ field: 'name', type: 'set', newValue: 'b', oldValue: 'a', timestamp: 1 }])).toHaveLength(1)
  })
})
