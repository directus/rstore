import { vi } from 'vitest'

/**
 * Marker object produced by mocked Directus SDK command factories.
 */
export interface DirectusSdkCall {
  /**
   * Mocked SDK command name (for example `readItems`).
   */
  op: string

  /**
   * Arguments passed to the SDK command factory.
   */
  args: any[]
}

/**
 * Creates the mocked `@directus/sdk` module map.
 *
 * Each SDK command factory returns a `{ op, args }` marker so tests can
 * assert exactly what was passed to `client.request`. The
 * `vi.mock('@directus/sdk', ...)` call itself must live in the test file
 * because vitest hoists mock declarations, and this module must not import
 * the plugin sources so the mock factory never becomes circular.
 */
export function directusSdkMocks(): Record<string, any> {
  const marker = (op: string) => (...args: any[]): DirectusSdkCall => ({ op, args })
  return {
    createItem: marker('createItem'),
    createItems: marker('createItems'),
    deleteItem: marker('deleteItem'),
    deleteItems: marker('deleteItems'),
    readItem: marker('readItem'),
    readItems: marker('readItems'),
    readSingleton: marker('readSingleton'),
    updateItem: marker('updateItem'),
    updateItemsBatch: marker('updateItemsBatch'),
    updateSingleton: marker('updateSingleton'),
    // Client factory stubs used by `createDirectusClient`.
    authentication: () => ({}),
    createDirectus: (url: string) => {
      const client: any = { url, request: vi.fn(), with: () => client }
      return client
    },
    rest: () => ({}),
  }
}
