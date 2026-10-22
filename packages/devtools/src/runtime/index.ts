import type { Plugin } from '@rstore/shared'
import type { Action, ActionResult, ReadRequest, SessionSummary, Target } from '../protocol'
import type { InspectableStore, RegistrationOptions, RstoreDevtools, RuntimeInvalidation, RuntimeOptions, StoreRegistration } from './types'
import * as v from 'valibot'
import { executeAction } from '../actions'
import { readRuntime } from '../inspection/reads'
import { installInstrumentation } from '../instrumentation/hooks'
import { DevtoolsError, TargetSchema } from '../protocol'
import { createRegistration, registrationSummary } from './registration'
import { decodeSessionRequest, encodeSessionRequest } from './session'

export * from './types'

/** Create isolated neutral authority, bounded instrumentation, and read handlers. */
export function createRstoreDevtools(options: RuntimeOptions = {}): RstoreDevtools {
  const request = encodeSessionRequest(options)
  const { request: _request, ...ownedOptions } = options
  const configuration = Object.freeze(ownedOptions)
  const sessionId = configuration.sessionId ?? globalThis.crypto.randomUUID()
  const startedAt = Date.now()
  const registrations = new Map<string, StoreRegistration>()
  const storeObjects = new WeakSet<object>()
  const generations = new Map<string, number>()
  const listeners = new Set<(event: RuntimeInvalidation) => void>()
  const pluginCleanups = new Set<() => void>()
  let active = true
  let registryRevision = 0
  /** Notify independently; a throwing observer cannot prevent other delivery. */
  function publish(event: RuntimeInvalidation) {
    if (!active)
      return
    for (const listener of listeners) {
      try {
        listener({ ...event, target: event.target ? { ...event.target } : undefined })
      }
      catch { /* Diagnostics cannot change application or other viewer behavior. */ }
    }
  }
  /** Fail explicit work after runtime shutdown. */
  function requireActive() {
    if (!active)
      throw new DevtoolsError({ code: 'UNAVAILABLE', message: 'Devtools runtime disposed' })
  }
  /** Attach with optional synchronously preinstalled plugin instrumentation. */
  function attach(store: InspectableStore, suppliedOptions: RegistrationOptions, installedHooks?: () => void) {
    const registrationOptions = Object.freeze({ ...suppliedOptions })
    requireActive()
    if (!registrationOptions.id || registrations.has(registrationOptions.id) || storeObjects.has(store))
      throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', message: 'Store ID and store object must have unique live registration' })
    const generation = (generations.get(registrationOptions.id) ?? 0) + 1
    generations.set(registrationOptions.id, generation)
    const target = { sessionId, storeId: registrationOptions.id, generation }
    let ownedStore: InspectableStore | undefined = store
    const registration = createRegistration(store, registrationOptions, target, configuration, publish, () => {
      registrations.delete(registrationOptions.id)
      if (ownedStore)
        storeObjects.delete(ownedStore)
      ownedStore = undefined
      publish({ view: 'registry', revision: ++registryRevision })
    }, installedHooks)
    registrations.set(registrationOptions.id, registration)
    storeObjects.add(store)
    publish({ view: 'registry', revision: ++registryRevision })
    return registration
  }
  /** Create real shared plugin; setup receives hooks, not a fictitious store. */
  function plugin(suppliedOptions: RegistrationOptions): Plugin {
    const registrationOptions = Object.freeze({ ...suppliedOptions })
    requireActive()
    return {
      name: `rstore-devtools:${registrationOptions.id}`,
      category: 'processing',
      meta: { description: 'Portable rstore development instrumentation' },
      setup({ hook }) {
        let attached = false
        let registration: StoreRegistration | undefined
        const uninstall = installInstrumentation(hook, () => registration)
        pluginCleanups.add(uninstall)
        const unhook = hook('init', ({ store }) => {
          if (!active || attached)
            return
          attached = true
          unhook()
          pluginCleanups.delete(unhook)
          registration = attach(store as unknown as InspectableStore, registrationOptions, uninstall)
          pluginCleanups.delete(uninstall)
        })
        pluginCleanups.add(unhook)
      },
    }
  }
  const runtime: RstoreDevtools = {
    get session(): SessionSummary {
      return { sessionId, kind: configuration.kind ?? 'node', label: configuration.label ?? sessionId, connected: active, completed: false, startedAt, stores: runtime.listStores(), request: decodeSessionRequest(request) }
    },
    attachStore: attach,
    plugin,
    listStores: () => [...registrations.values()].map(registrationSummary),
    resolve(input: Target) {
      requireActive()
      const parsed = v.safeParse(TargetSchema, input)
      if (!parsed.success)
        throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', message: 'Invalid target identity' })
      const target = parsed.output
      const registration = registrations.get(target.storeId)
      if (target.sessionId !== sessionId || !registration)
        throw new DevtoolsError({ code: 'TARGET_NOT_FOUND', message: 'Store target unavailable', target })
      if (registration.target.generation !== target.generation)
        throw new DevtoolsError({ code: 'STALE_TARGET', message: 'Store generation replaced', target })
      return registration
    },
    read: ((request: ReadRequest) => {
      requireActive()
      return readRuntime(runtime, request)
    }) as RstoreDevtools['read'],
    execute: (action: Action): Promise<ActionResult> => executeAction(runtime, action),
    subscribe(listener, target, view) {
      requireActive()
      const registration = target ? runtime.resolve(target) : undefined
      const shouldObserve = view === 'modules' || (view === 'cache' && registration?.adapter?.observe)
      const stopObservation = shouldObserve ? registration?.observe() : undefined
      const callback = (event: RuntimeInvalidation) => {
        if (!target || !event.target || (event.target.sessionId === target.sessionId
          && event.target.storeId === target.storeId && event.target.generation === target.generation)) {
          if (!view || event.view === view || event.view === 'registry')
            listener(event)
        }
      }
      listeners.add(callback)
      return () => {
        listeners.delete(callback)
        stopObservation?.()
      }
    },
    dispose() {
      if (!active)
        return
      active = false
      for (const cleanup of pluginCleanups) {
        try {
          cleanup()
        }
        catch { /* Continue cleanup after a third-party observer fault. */ }
      }
      pluginCleanups.clear()
      for (const registration of registrations.values()) {
        try {
          registration.dispose()
        }
        catch { /* Continue releasing other stores after a faulty cleanup. */ }
      }
      registrations.clear()
      generations.clear()
      listeners.clear()
    },
  }
  return runtime
}
