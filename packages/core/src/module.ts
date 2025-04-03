import type { Awaitable, CreateModuleApi, Module, ModuleMutation, ResolvedModule, StoreCore } from '@rstore/shared'

type ResolveCallbacks = Array<() => Awaitable<unknown>>

/**
 * Define an rstore module.
 *
 * Learn more: https://rstore.dev/guide/data/module.html
 */
export function defineModule<
  const TModule extends Module,
  const TModuleExposed extends Record<string, any>,
>(cb: () => ResolvedModule<TModule, TModuleExposed>): () => Awaitable<ResolvedModule<TModule, TModuleExposed>> & ResolvedModule<TModule, TModuleExposed> {
  return () => {
    const resolvedModule = cb() as ResolvedModule<TModule, TModuleExposed> & {
      $callbacks: ResolveCallbacks
    }
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

/**
 * Create an rstore module. This function should be used inside the `defineModule` function.
 *
 * Learn more: https://rstore.dev/guide/data/module.html
 * @param store The store instance
 * @param module The module options
 * @returns A module setup API
 */
export function createModule<
  TModule extends Module,
>(store: StoreCore<any, any>, module: TModule): CreateModuleApi<TModule> {
  const state = store.$cache.getModuleState(module.name, module.state)

  const $callbacks: ResolveCallbacks = []
  function onResolve(cb: () => Awaitable<unknown>) {
    $callbacks.push(cb)
  }

  /**
   * Allow looking up the exposed mutations.
   */
  let _exposed: Record<string, any> = {}

  return {
    ...module,
    state,
    resolve(exposed: any) {
      _exposed = exposed
      const resolved: ResolvedModule<any, any> & {
        $callbacks: ResolveCallbacks
      } = {
        ...exposed,
        $module: module.name,
        $state: state,
        $callbacks,
      }
      store.$registeredModules.set(module.name, resolved)
      onResolve(() => store.$hooks.callHook('moduleResolved', {
        store,
        module: resolved,
      }))
      return resolved
    },
    onResolve,
    defineMutation(mutation) {
      let key: string | undefined
      const originalMutation = mutation
      mutation = ((...args: Parameters<typeof mutation>) => {
        if (!key) {
          key = Object.keys(_exposed).find(k => _exposed[k] === mutation)
        }
        store.$mutationHistory.push({
          operation: 'module-mutation',
          module: module.name,
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
}
