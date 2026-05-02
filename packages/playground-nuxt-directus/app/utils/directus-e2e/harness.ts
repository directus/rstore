import type { DirectusE2eStore } from './helpers'
import { runBulkMutationCase, runSingletonCase } from './mutation-cases'
import { runCacheOperatorCase, runQueryCase } from './query-cases'
import { runRelationCase } from './relation-case'

export type DirectusE2eCaseName = 'queries' | 'cacheOperators' | 'bulkMutations' | 'singleton' | 'relations'

export interface DirectusE2eHarness {
  /**
   * Runs one named Directus adapter case with a unique data prefix.
   */
  run: (caseName: DirectusE2eCaseName, prefix: string) => Promise<Record<string, unknown>>
}

declare global {
  interface Window {
    /**
     * Browser-only harness used by Playwright tests.
     */
    __rstoreDirectusE2E?: DirectusE2eHarness
  }
}

/**
 * Creates the browser-only Directus adapter e2e harness.
 */
export function createDirectusE2eHarness(store: DirectusE2eStore): DirectusE2eHarness {
  return {
    async run(caseName, prefix) {
      switch (caseName) {
        case 'queries':
          return await runQueryCase(store, prefix)
        case 'cacheOperators':
          return await runCacheOperatorCase(store, prefix)
        case 'bulkMutations':
          return await runBulkMutationCase(store, prefix)
        case 'singleton':
          return await runSingletonCase(store, prefix)
        case 'relations':
          return await runRelationCase(store, prefix)
        default:
          throw new Error(`Unknown Directus e2e case: ${caseName satisfies never}`)
      }
    },
  }
}
