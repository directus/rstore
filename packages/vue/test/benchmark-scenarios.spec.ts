import { describe, expect, it } from 'vitest'
import { BENCHMARK_IMPLEMENTATIONS } from '../benchmark/entrypoint'
import { FULL_PROFILE } from '../benchmark/profiles'

describe('benchmark scenarios', () => {
  for (const definition of FULL_PROFILE.scenarios) {
    for (const implementation of BENCHMARK_IMPLEMENTATIONS) {
      it(`${definition.id} stays bounded and valid for ${implementation.name}`, () => {
        const runtime = definition.build(implementation, { items: 20, watchers: 3 })
        try {
          runtime.resetMeasurements()
          for (let index = 0; index < 25; index++) runtime.operation(index)
          expect(() => runtime.validate(25)).not.toThrow()
        }
        finally {
          runtime.teardown()
        }
      })
    }
  }
})
