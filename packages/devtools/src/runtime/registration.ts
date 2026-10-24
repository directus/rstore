import type { StoreSummary, Target } from '../protocol'
import type { InspectableStore, RegistrationOptions, RuntimeInvalidation, RuntimeOptions, StoreRegistration } from './types'
import { releaseActionRegistration } from '../actions'
import { createInspectionContext } from '../inspection/context'
import { readModules } from '../inspection/modules'
import { createHistory } from '../instrumentation/history'
import { installInstrumentation } from '../instrumentation/hooks'
import { createInvalidator, createRevisions } from '../instrumentation/revisions'
import { DevtoolsError } from '../protocol'

/** All registration-owned resources are released together under exact authority. */
export function createRegistration(
  initialStore: InspectableStore,
  options: RegistrationOptions,
  target: Target,
  runtimeOptions: RuntimeOptions,
  publish: (event: RuntimeInvalidation) => void,
  remove: () => void,
  installedHooks?: () => void,
): StoreRegistration {
  let store: InspectableStore | undefined = initialStore
  let active = true
  let observationCount = 0
  let stopObservation: (() => void) | undefined
  // Reaches the store through the Core plugin `hook` closure: dropped on dispose,
  // since stop handles returned by `observe()` keep this scope alive.
  let uninstall: (() => void) | undefined
  const revisions = createRevisions()
  const invalidator = createInvalidator(revisions, (view, revision) => publish({ target: { ...target }, view, revision }))
  const history = createHistory({ limit: runtimeOptions.historyLimit, maxBytes: runtimeOptions.historyBytes, unwrap: options.adapter?.unwrap, onChange: () => invalidator.invalidate('history') })
  const readOnly = Boolean(options.readOnly || runtimeOptions.kind === 'ssr')
  const capabilities = Object.freeze({
    cacheInspection: Boolean(options.adapter?.readCache || initialStore.$cache.inspect),
    moduleObservation: true,
    cacheWrites: !readOnly,
    backendMutations: !readOnly,
    readOnly,
  })
  /** Stop existing watcher/timer without letting a cleanup fault leak ownership. */
  function stop() {
    const cleanup = stopObservation
    stopObservation = undefined
    try {
      cleanup?.()
    }
    catch { /* Adapter cleanup faults cannot retain timer or other registration. */ }
  }
  const registration: StoreRegistration = {
    target: Object.freeze({ ...target }),
    label: options.label ?? options.id,
    adapter: options.adapter,
    get store() {
      if (!store)
        throw new DevtoolsError({ code: 'STALE_TARGET', message: 'Store registration disposed', target })
      return store
    },
    capabilities,
    readOnly,
    revisions,
    history,
    subscriptions: new Map(),
    invalidate: invalidator.invalidate,
    observe() {
      if (!active)
        throw new DevtoolsError({ code: 'STALE_TARGET', message: 'Store registration disposed', target })
      observationCount++
      if (observationCount === 1) {
        if (options.adapter?.observe) {
          try {
            stopObservation = options.adapter.observe(registration.store, (view = 'modules') => {
              invalidator.invalidate(view)
              if (view === 'cache')
                invalidator.invalidate('collections')
            })
          }
          catch { /* Unsupported adapter observation must not break reads. */ }
        }
        else {
          let previous = JSON.stringify(readModules(registration, createInspectionContext(registration)))
          const timer = setInterval(() => {
            try {
              if (!active)
                return
              const next = JSON.stringify(readModules(registration, createInspectionContext(registration)))
              if (next !== previous) {
                previous = next
                invalidator.invalidate('modules')
              }
            }
            catch { /* Projection of hostile module values stays diagnostic only. */ }
          }, 250)
          stopObservation = () => clearInterval(timer)
        }
      }
      let observing = true
      return () => {
        if (!observing)
          return
        observing = false
        if (--observationCount === 0)
          stop()
      }
    },
    dispose() {
      if (!active)
        return
      active = false
      invalidator.dispose()
      stop()
      const release = uninstall
      uninstall = undefined
      release?.()
      releaseActionRegistration(registration)
      registration.subscriptions.clear()
      history.clear()
      store = undefined
      remove()
    },
  }
  uninstall = installedHooks ?? installInstrumentation(initialStore.$hooks.hook, () => active ? registration : undefined)
  return registration
}

/** Selector summary owns no mutable registration metadata. */
export function registrationSummary(registration: StoreRegistration): StoreSummary {
  return { target: { ...registration.target }, label: registration.label, capabilities: { ...registration.capabilities } }
}
