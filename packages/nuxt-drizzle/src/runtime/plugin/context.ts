// @ts-expect-error virtual module
import { apiPath, dialect, scopeId as drizzleScopeId } from '#build/$rstore-drizzle-config.js'
import { useRequestFetch } from '#imports'
import { getRstoreDrizzleClientId, RSTORE_DRIZZLE_CLIENT_ID_HEADER } from '../utils/client-id'

export { drizzleScopeId }

/** Runtime context shared by client hook installers. */
export interface DrizzlePluginContext {
  /** Configured REST API base path. */
  apiPath: string
  /** Drizzle SQL dialect used by where filtering. */
  dialect: string
  /** Nuxt request fetch implementation. */
  requestFetch: ReturnType<typeof useRequestFetch>
}

/** Create the shared runtime context for the plugin setup. */
export function createDrizzlePluginContext(): DrizzlePluginContext {
  return {
    apiPath,
    dialect,
    requestFetch: useRequestFetch(),
  }
}

/** Return headers carrying the current realtime client id when present. */
export function clientIdHeaders(): Record<string, string> | undefined {
  const id = getRstoreDrizzleClientId()
  return id ? { [RSTORE_DRIZZLE_CLIENT_ID_HEADER]: id } : undefined
}
