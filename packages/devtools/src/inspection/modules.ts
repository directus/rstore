import type { ModuleSummary } from '../protocol'
import type { StoreRegistration } from '../runtime/types'
import type { InspectionContext } from './context'

/** Project resolved module values; functions become metadata rather than actions. */
export function readModules(registration: StoreRegistration, context: InspectionContext): ModuleSummary[] {
  const result: ModuleSummary[] = []
  for (const module of registration.store.$getModules()) {
    if (result.length >= 1000 || context.remainingBytes < 1024) {
      context.markTruncated()
      break
    }
    // Exclude implementation callbacks without invoking getters or mutations.
    const exposed = Object.create(null)
    const keys = Object.keys(module)
    if (keys.length > 1000)
      context.markTruncated()
    for (const key of keys.slice(0, 1000)) {
      if (key !== '$callbacks' && key !== '$module') {
        const descriptor = Object.getOwnPropertyDescriptor(module, key)
        if (descriptor)
          Object.defineProperty(exposed, key, descriptor)
      }
    }
    result.push({ name: module.$module, value: context.project(exposed) })
  }
  return result
}
