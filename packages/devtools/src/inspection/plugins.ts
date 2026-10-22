import type { PluginSummary } from '../protocol'
import type { StoreRegistration } from '../runtime/types'
import type { InspectionContext } from './context'

/** Publish plugin descriptions without retaining setup, connector, or hook closures. */
export function readPlugins(registration: StoreRegistration, context: InspectionContext): PluginSummary[] {
  const result: PluginSummary[] = []
  for (const plugin of registration.store.$plugins) {
    if (result.length >= 1000 || context.remainingBytes < 1024) {
      context.markTruncated()
      break
    }
    result.push({ name: plugin.name, category: plugin.category, metadata: context.project(plugin.meta) })
  }
  return result
}
