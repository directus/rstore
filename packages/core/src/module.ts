import type { Awaitable, CreateModuleApi, Module, ModuleMutation, ResolvedModule, StoreCore } from '@rstore/shared'

type ResolveCallbacks = Array<() => Awaitable<unknown>>

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

export function createModule<
  TModule extends Module,
>(store: StoreCore<any, any>, module: TModule): CreateModuleApi<TModule> {
  const state = store.$cache.getModuleState(module.name, module.state)

  const $callbacks: ResolveCallbacks = []
  function onResolve(cb: () => Awaitable<unknown>) {
    $callbacks.push(cb)
  }

  return {
    ...module,
    state,
    resolve(exposed: any) {
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
      mutation = store.$wrapMutation(mutation)
      ;(mutation as any).__brand = 'rstore-module-mutation'
      return mutation as ModuleMutation<typeof mutation>
    },
  }
}
