import type { Plugin, PluginSetupApi } from '@rstore/shared'

/** A hook callback captured from a connector plugin setup. */
export type ConnectorPluginHook = (payload: any) => unknown

/** Hook callbacks keyed by their rstore hook name. */
export type ConnectorPluginHooks = Record<string, ConnectorPluginHook>

/**
 * Runs a connector plugin setup and records its generic hook callbacks.
 *
 * Adapter-specific collections, metadata, and client doubles remain in each
 * adapter's own fixtures; this helper only supplies the common setup surface.
 */
export function capturePluginHooks(plugin: Pick<Plugin, 'setup'>): ConnectorPluginHooks {
  const hooks: ConnectorPluginHooks = {}

  plugin.setup({
    addCollectionDefaults: () => {},
    hook(name, callback) {
      const hookName = String(name)
      const captured = callback as ConnectorPluginHook
      hooks[hookName] = captured

      return () => {
        if (hooks[hookName] === captured) {
          delete hooks[hookName]
        }
      }
    },
  } as PluginSetupApi)

  return hooks
}

/**
 * Invokes a captured data hook with the common result plumbing used by tests.
 */
export async function runConnectorHook(callback: ConnectorPluginHook, payload: Record<string, any>): Promise<unknown> {
  let result: unknown
  await callback({
    abort: () => {},
    findOptions: {},
    getResult: () => result,
    setResult: (value: unknown) => {
      result = value
    },
    ...payload,
  })
  return result
}
