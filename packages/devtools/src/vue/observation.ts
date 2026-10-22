import type { InspectableStore, InspectionView } from '../runtime/types'
import { effectScope, ref, unref, watchEffect } from 'vue'
import { projectValue } from '../projection'
import { isInspectionRef, unwrapVueValue } from './unwrap'

/** Read bounded reactive data descriptors, retaining dependencies without calling application getters. */
function collectDependencies(input: unknown): void {
  const seen = new WeakSet<object>()
  let entries = 0
  let examinedKeys = 0
  /** Visit real reactive proxies, while using raw descriptors to exclude accessors. */
  function visit(source: unknown, depth: number): void {
    if (entries++ >= 1000 || depth > 10)
      return
    const value = isInspectionRef(source) ? unref(source) : source
    if (value === null || typeof value !== 'object')
      return
    const raw = unwrapVueValue(value) as object
    if (seen.has(raw))
      return
    seen.add(raw)
    if (raw instanceof Map || raw instanceof Set) {
      // Vue's instrumented iterator tracks structural changes, unlike the raw native iterator.
      for (const child of value as Map<unknown, unknown> | Set<unknown>) {
        visit(child, depth + 1)
        if (entries >= 1000)
          break
      }
      return
    }
    for (const key in value) {
      // Accessors and inherited keys still consume reflection budget, even when not visited as values.
      if (examinedKeys >= 1000)
        break
      examinedKeys++
      const descriptor = Object.getOwnPropertyDescriptor(raw, key)
      if (descriptor && 'value' in descriptor)
        visit(Reflect.get(value, key), depth + 1)
      if (entries >= 1000)
        break
    }
  }
  try {
    visit(input, 0)
  }
  catch { /* Hostile proxy failures cannot affect application work. */ }
}

/** Observe public module/cache state only during explicit runtime interest. */
export function observeVueStore(store: InspectableStore, onChange: (view?: InspectionView) => void): () => void {
  const scope = effectScope(true)
  const registryRevision = ref(0)
  // Module and layer membership is not reactive. Their public lifecycle hooks
  // rerun dependency collection so later state changes join this observation.
  const releases = (['moduleResolved', 'cacheLayerAdd', 'cacheLayerRemove'] as const).map(name =>
    store.$hooks.hook(name, () => { registryRevision.value++ }))
  let previousModules: string | undefined
  let previousLayers: string | undefined
  scope.run(() => {
    watchEffect(() => {
      void registryRevision.value
      const modules = store.$getModules()
      collectDependencies(modules)
      const inspection = store.$cache.inspect?.()
      // Hook-driven cache writes and direct reactive layer edits both invalidate
      // diagnostics. Bound borrowed row/deletion reads before collecting dependencies.
      const layers = []
      let rowCount = 0
      let deletionCount = 0
      if (inspection) {
        for (const layer of inspection.layers()) {
          const rows = []
          const deletedKeys = []
          for (const row of layer.rows()) {
            if (rowCount++ >= 1000)
              break
            rows.push(row)
          }
          for (const key of layer.deletedKeys()) {
            if (deletionCount++ >= 1000)
              break
            deletedKeys.push(key)
          }
          layers.push({ ...layer, rows, deletedKeys })
          if (layers.length >= 1000)
            break
        }
      }
      collectDependencies(layers)
      const modulesSnapshot = JSON.stringify(projectValue(modules, { unwrap: unwrapVueValue }).value)
      const layersSnapshot = JSON.stringify(projectValue(layers, { unwrap: unwrapVueValue }).value)
      if (previousModules !== undefined && modulesSnapshot !== previousModules)
        onChange('modules')
      if (previousLayers !== undefined && layersSnapshot !== previousLayers)
        onChange('cache')
      previousModules = modulesSnapshot
      previousLayers = layersSnapshot
    })
  })
  return () => {
    for (const release of releases) release()
    scope.stop()
  }
}
