import {
  authentication,
  createDirectus,
  rest,
} from '@directus/sdk'

/**
 * Options used to create a browser/runtime Directus SDK client.
 */
export interface CreateDirectusClientOptions {
  /**
   * Directus API URL.
   */
  url: string
}

/**
 * Directus SDK client shape used by the rstore Directus plugin.
 */
export type DirectusRstoreClient = ReturnType<typeof createDirectusClient>

/**
 * Creates the Directus SDK client used by rstore runtime requests.
 */
export function createDirectusClient(options: CreateDirectusClientOptions) {
  return createDirectus(options.url)
    .with(rest())
    .with(authentication())
}
