import type { RstoreMultiplayerChannel } from '../src/runtime/composables/useRstoreMultiplayerChannel'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, shallowRef } from 'vue'
import { useRstoreMultiplayerForm } from '../src/runtime/composables/useRstoreMultiplayerForm'
import { muteVueLifecycleWarnings, withScope } from './utils'

/** Minimal channel stub — only the surface the form composable touches. */
function makeChannel() {
  return {
    remoteUpdate: shallowRef<Record<string, any> | null>(null),
    sendUpdate: vi.fn(),
    rebaseTextCursor: vi.fn(),
  } as unknown as RstoreMultiplayerChannel<any, any> & {
    remoteUpdate: ReturnType<typeof shallowRef<Record<string, any> | null>>
  }
}

/** Fake rstore form: `$rebase` applies the base onto the form fields. */
function makeForm(initial: Record<string, any>) {
  const form: any = { ...initial }
  form.$rebase = vi.fn((base: Record<string, any>, changedFields: string[] = []) => {
    for (const field of changedFields) {
      form[field] = base[field]
    }
  })
  form.$onChange = vi.fn(() => () => {})
  form.$opLog = { undo: vi.fn(), redo: vi.fn() }
  return form
}

describe('useRstoreMultiplayerForm remote update sanitization', () => {
  beforeEach(() => {
    muteVueLifecycleWarnings()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('filters incoming fields against trackedFields and drops proto keys', async () => {
    const channel = makeChannel()
    const form = makeForm({ title: 'old', body: 'text' })
    const base = { title: 'old', body: 'text', isAdmin: false }

    const { dispose } = withScope(() => useRstoreMultiplayerForm({
      form,
      channel,
      getBaseValue: () => base,
      trackedFields: ['title', 'body'],
    }))

    // Hostile room member: overwrites an untracked field and smuggles a
    // prototype-polluting key (own property via JSON.parse).
    channel.remoteUpdate.value = JSON.parse(
      '{"title": "new", "isAdmin": true, "__proto__": {"polluted": true}}',
    )
    await nextTick()

    expect(form.$rebase).toHaveBeenCalledTimes(1)
    const [nextBase, changedFields] = form.$rebase.mock.calls[0]
    expect(changedFields).toEqual(['title'])
    expect(nextBase.title).toBe('new')
    expect(nextBase.isAdmin).toBe(false)
    expect(Object.keys(nextBase)).not.toContain('__proto__')
    expect(({} as any).polluted).toBeUndefined()
    expect(form.isAdmin).toBeUndefined()

    dispose()
  })

  it('ignores updates that only contain untracked or forbidden keys', async () => {
    const channel = makeChannel()
    const form = makeForm({ title: 'old' })

    const { dispose } = withScope(() => useRstoreMultiplayerForm({
      form,
      channel,
      getBaseValue: () => ({ title: 'old' }),
      trackedFields: ['title'],
    }))

    channel.remoteUpdate.value = JSON.parse('{"isAdmin": true, "__proto__": {"polluted": true}}')
    await nextTick()

    expect(form.$rebase).not.toHaveBeenCalled()

    dispose()
  })

  it('drops proto keys even without a trackedFields allowlist', async () => {
    const channel = makeChannel()
    const form = makeForm({ title: 'old' })

    const { dispose } = withScope(() => useRstoreMultiplayerForm({
      form,
      channel,
      getBaseValue: () => ({ title: 'old' }),
    }))

    channel.remoteUpdate.value = JSON.parse('{"title": "new", "constructor": {"bad": 1}, "prototype": {}}')
    await nextTick()

    expect(form.$rebase).toHaveBeenCalledTimes(1)
    const [, changedFields] = form.$rebase.mock.calls[0]
    expect(changedFields).toEqual(['title'])

    dispose()
  })
})
