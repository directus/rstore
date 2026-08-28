import type { EffectScope } from 'vue'
import type { ScenarioRuntime } from '../scenario-harness'
import type { MemoryScenarioRuntime } from './types'
import { invariant } from '../scenario-harness'

/** Wrap shared cache runtime with bounded memory-scenario lifecycle. */
export function finishMemoryScenario(
  runtime: ScenarioRuntime,
  scope: EffectScope | undefined,
  advanceOne: (index: number) => void,
  validateExtra: () => void = () => {},
): MemoryScenarioRuntime {
  let operations = 0
  let tornDown = false
  return {
    advance(start, count) {
      invariant(Number.isSafeInteger(start) && start >= 0, 'memory scenario start must be a non-negative integer')
      invariant(Number.isSafeInteger(count) && count >= 0, 'memory scenario count must be a non-negative integer')
      for (let offset = 0; offset < count; offset++)
        advanceOne(start + offset)
      operations += count
    },
    validate() {
      invariant(operations >= 0, 'memory scenario operation count became invalid')
      validateExtra()
    },
    teardown() {
      if (tornDown)
        return
      tornDown = true
      scope?.stop()
      invariant(!scope?.active, 'memory scenario effect scope remained active')
      runtime.cache.dispose()
    },
  }
}

/** Count serialized base rows without materializing public wrappers. */
export function stateCollectionSize(runtime: ScenarioRuntime, collectionName: string): number {
  return Object.keys(runtime.cache.getState().collections[collectionName] ?? {}).length
}

/** Create no-cache control lifecycle for forced-GC noise. */
export function createControlRuntime(): MemoryScenarioRuntime {
  let checksum = 0
  let tornDown = false
  return {
    advance(start, count) {
      for (let index = start; index < start + count; index++)
        checksum = (checksum + index) % 1_000_003
    },
    validate() {
      invariant(Number.isFinite(checksum), 'control checksum became invalid')
    },
    teardown() {
      tornDown = true
      invariant(tornDown, 'control teardown failed')
    },
  }
}
