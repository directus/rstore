import { describe, it } from 'vitest'
import { BENCHMARK_IMPLEMENTATIONS } from '../benchmark/entrypoint'
import { FULL_MEMORY_PROFILE } from '../benchmark/memory/profiles'

describe('memory benchmark scenarios', () => {
  for (const { scenario: definition, dimensions } of uniqueScenarios()) {
    for (const implementation of BENCHMARK_IMPLEMENTATIONS) {
      it(`${definition.id} stays valid for ${implementation.name}`, () => {
        let runtime = definition.build(implementation, {
          items: definition.id === 'index-result-churn' ? dimensions.items : 20,
          watchers: 3,
        })
        try {
          runtime.advance(0, Math.min(4, definition.warmupUnits))
          runtime.validate()
          runtime.advance(definition.warmupUnits, Math.min(8, definition.growthUnits))
          runtime.validate()
        }
        finally {
          runtime.teardown()
          runtime = undefined as never
        }
      })
    }
  }
})

/** Return one definition for every stable scenario id. */
function uniqueScenarios() {
  return [...new Map(FULL_MEMORY_PROFILE.rows.map(row => [row.scenario.id, row])).values()]
}
