import type { Awaitable, CreateModuleApi, Module, ModuleMutation, ResolvedModule, StoreCore, StoreSchema } from '@rstore/shared'

type ResolveCallbacks = Array<() => Awaitable<unknown>>

/**
 * Define an rstore module.
 *
 * Learn more: https://rstore.dev/guide/data/module.html
 */
export function defineModule<
  const TModule extends Module,
  const TModuleExposed extends Record<string, any>,
  TStore extends StoreCore<StoreSchema>,
>(
  store: TStore,
  name: TModule['name'],
  cb: (api: CreateModuleApi<TStore>) => TModuleExposed,
): () => Awaitable<ResolvedModule<TModule, TModuleExposed>> & ResolvedModule<TModule, TModuleExposed> {
  return () => {
    const state: Record<string, Record<string, any>> = {}

    let stateKey = 0

    const $callbacks: ResolveCallbacks = []
    function onResolve(cb: () => Awaitable<unknown>) {
      $callbacks.push(cb)
    }

    /**
     * Allow looking up the exposed mutations.
     */
    let _exposed: Record<string, any> = {}

    const api: CreateModuleApi<TStore> = {
      store,
      onResolve,
      defineState<TState extends Record<string, any>>(s: TState, key?: string): TState {
        if (!key) {
          key = String(stateKey++)
        }
        const stateFromCache = store.$cache.getModuleState(name, key, s)
        state[key] = stateFromCache
        return stateFromCache as TState
      },
      defineMutation(mutation) {
        let key: string | undefined
        const originalMutation = mutation
        mutation = ((...args: Parameters<typeof mutation>) => {
          if (!key) {
            key = Object.keys(_exposed).find(k => _exposed[k] === mutation)
          }
          store.$mutationHistory.push({
            operation: 'module-mutation',
            module: name,
            key: key!,
            payload: args,
          })
          return originalMutation(...args)
        }) as typeof mutation
        mutation = store.$wrapMutation(mutation)
        ;(mutation as any).__brand = 'rstore-module-mutation'
        return mutation as ModuleMutation<typeof mutation>
      },
    }

    function resolve(exposed: TModuleExposed): ResolvedModule<TModule, TModuleExposed> & { $callbacks: ResolveCallbacks } {
      _exposed = exposed
      const resolved: ResolvedModule<any, any> & {
        $callbacks: ResolveCallbacks
      } = {
        ...exposed,
        $module: name,
        $state: state,
        $callbacks,
      }
      store.$registeredModules.set(name, resolved)
      onResolve(() => store.$hooks.callHook('moduleResolved', {
        store,
        module: resolved,
      }))
      return resolved
    }

    const resolvedModule = resolve(cb(api))

    // eslint-disable-next-line no-async-promise-executor
    const promise = new Promise<ResolvedModule<TModule, TModuleExposed>>(async (resolve) => {
      for (const cb of resolvedModule.$callbacks) {
        await cb()
      }
      resolve(resolvedModule)
    })
    Object.assign(promise, resolvedModule)
    return promise as Awaitable<ResolvedModule<TModule, TModuleExposed>> & ResolvedModule<TModule, TModuleExposed>
  }
}
