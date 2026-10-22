import type { InspectorTransport } from '../app/transport/types'
import type { Action, ActionResult, SessionSummary } from '../src/protocol'
import { describe, expect, it } from 'vitest'
import { createDeferred } from '../../../test/utils/deferred'
import { ActionDraft, parseEditor } from '../app/stores/actions'
import { Inspector } from '../app/stores/connection'
import { Selection } from '../app/stores/selection'
import { DevtoolsError } from '../src/protocol'

// Pure command construction algorithm: authority and original typed key must survive.
describe('inspector action authority', () => {
  const target = { sessionId: 'browser', storeId: 'one', generation: 1 }
  it('preserves numeric zero key and never uses projected previews as payload', () => {
    const selection = new Selection()
    selection.select(target)
    const draft = new ActionDraft(selection, 'update-item', 'Books', 0)
    draft.text = '{"title":"Fresh"}'
    expect(draft.command(selection, 'command-one', 100)).toEqual({
      target,
      action: 'update-item',
      collection: 'Books',
      key: 0,
      item: { title: 'Fresh' },
      commandId: 'command-one',
      issuedAt: 100,
    })
  })
  it('rejects submission after store switches even when editor input remains valid', () => {
    const selection = new Selection()
    selection.select(target)
    const draft = new ActionDraft(selection, 'create-item', 'Books')
    draft.text = '{"title":"Fresh"}'
    selection.select({ ...target, storeId: 'two' })
    expect(() => draft.command(selection, 'command-two', 100)).toThrow('Selected target changed')
  })
  it('requires explicit confirmation for deletion and preserves empty-string key', () => {
    const selection = new Selection()
    selection.select(target)
    const draft = new ActionDraft(selection, 'delete-cache-item', 'Books', '')
    expect(() => draft.command(selection, 'command-three', 100)).toThrow('Confirm action')
    draft.confirmed = true
    expect(draft.command(selection, 'command-three', 100)).toEqual({
      target,
      action: 'delete-cache-item',
      collection: 'Books',
      key: '',
      commandId: 'command-three',
      issuedAt: 100,
    })
  })
  it('rejects non-object JSON and unsafe object fields before dispatch', () => {
    expect(() => parseEditor('[]')).toThrow('Expected JSON object')
    expect(() => parseEditor('{broken}')).toThrow()
    const selection = new Selection()
    selection.select(target)
    const draft = new ActionDraft(selection, 'create-item', 'Books')
    draft.text = '{"__proto__":{"polluted":true}}'
    expect(() => draft.command(selection, 'command-four', 100)).toThrow()
  })
  it('prevents duplicate submissions and late old-target completion from changing new target feedback', async () => {
    // Async ownership algorithm inputs are controlled here. Actual browser and
    // connector effects are validated separately by browser/runtime suites.
    const pending = createDeferred<ActionResult>()
    const started = createDeferred<void>()
    const commands: Action[] = []
    const second = { ...target, storeId: 'two' }
    const inspector = new Inspector()
    inspector.status = 'live'
    inspector.sessions = [{ sessionId: target.sessionId, kind: 'browser', label: 'Browser', connected: true, completed: false, startedAt: 100, stores: [target, second].map(value => ({ target: value, label: value.storeId, capabilities: { cacheInspection: true, moduleObservation: true, cacheWrites: true, backendMutations: true, readOnly: false } })) }] satisfies SessionSummary[]
    inspector.transport = {
      read: async (_view, value) => ({ target: value, revision: 1, truncated: false, data: [{ name: value.storeId, virtual: false, relations: null, actions: ['create-item'] }] }),
      action: async (command) => {
        commands.push(command)
        started.resolve()
        return pending.promise
      },
    } as InspectorTransport
    await inspector.select(target)
    inspector.open('create-item', 'one')
    inspector.draft!.text = '{"name":"Fresh"}'
    const submitted = inspector.submit()
    await started.promise
    await inspector.submit()
    expect(commands).toHaveLength(1)
    expect(inspector.outcome?.status).toBe('pending')
    await inspector.select(second)
    pending.resolve({ target, commandId: commands[0]!.commandId, action: 'create-item', status: 'completed', revisions: {} })
    await submitted
    expect(inspector.outcome).toBeNull()
    expect(inspector.outcomes.map(record => ({ target: record.command.target, status: record.status }))).toEqual([{ target, status: 'completed' }])
    expect(inspector.reply?.target).toEqual(second)
    expect(inspector.reply?.data).toEqual([{ name: 'two', virtual: false, relations: null, actions: ['create-item'] }])
  })
  it('distinguishes known backend failure from unknown outcome and retains entered JSON', async () => {
    const inspector = new Inspector()
    inspector.status = 'live'
    inspector.selection.select(target)
    inspector.sessions = [{ sessionId: target.sessionId, kind: 'browser', label: 'Browser', connected: true, completed: false, startedAt: 100, stores: [{ target, label: 'One', capabilities: {
      cacheInspection: true,
      moduleObservation: false,
      cacheWrites: true,
      backendMutations: true,
      readOnly: false,
    } }] }]
    inspector.transport = { action: async () => {
      throw new DevtoolsError({ code: 'BACKEND_FAILURE', message: 'Connector unavailable' })
    } } as InspectorTransport
    inspector.open('create-item', 'Books')
    inspector.draft!.text = '{"title":"Retained"}'
    await inspector.submit()
    expect(inspector.outcome?.status).toBe('failed')
    expect(inspector.outcome?.error).toBe('Connector unavailable')
    expect(inspector.draft?.text).toBe('{"title":"Retained"}')
    inspector.transport = { action: async () => {
      throw new DevtoolsError({ code: 'UNKNOWN_OUTCOME', message: 'Disconnected after dispatch', outcome: 'unknown' })
    } } as InspectorTransport
    await inspector.submit()
    expect(inspector.outcome?.status).toBe('unknown')
    expect(inspector.draft?.text).toBe('{"title":"Retained"}')
  })
})
