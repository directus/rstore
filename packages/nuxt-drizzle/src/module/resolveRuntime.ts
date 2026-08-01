import fs from 'node:fs'
import path from 'pathe'

const RUNTIME_PREFIX = './runtime'

/**
 * Builds the resolver used for every `./runtime/*` id the module registers.
 *
 * The module entry lives in `src/module/` during development — where the runtime
 * is a directory up, at `src/runtime/` — but is bundled flat to `dist/module.mjs`
 * when published, sitting next to `dist/runtime/`. Both layouts are in use (the
 * drizzle playground loads the module from source, everything else from the
 * package), so the layout is probed rather than assumed: hardcoding either one
 * breaks the other.
 *
 * @param resolve The base resolver, normally `createResolver(import.meta.url).resolve`.
 * @param exists Existence probe for the runtime directory; injectable for tests.
 * @returns A resolver that maps `./runtime/*` ids to the real runtime directory.
 */
export function createRuntimeResolver(
  resolve: (id: string) => string,
  exists: (candidate: string) => boolean = fs.existsSync,
) {
  const runtimeDir = exists(resolve(RUNTIME_PREFIX)) ? resolve(RUNTIME_PREFIX) : resolve('../runtime')

  return (id: string) => id.startsWith(RUNTIME_PREFIX)
    ? path.join(runtimeDir, id.slice(RUNTIME_PREFIX.length))
    : resolve(id)
}
