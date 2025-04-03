import type { MutationSpecialProps } from './mutation'
import type { Awaitable, Brand } from './utils'

export interface Module {
  /**
   * Name of the module. It should be unique across the application.
   */
  name: string
  /**
   * State of the module. This is a plain object that can be used to store any data related to the module. It should be serializable to JSON to ensure compatibility with SSR and other future sync features.
   */
  state: Record<string, any>
}

export type ResolvedModuleState<TModule extends Module> = TModule['state']

export type ResolvedModule<
  TModule extends Module,
  TModuleExposed extends Record<string, any>,
> = TModuleExposed & {
  /**
   * Module name.
   */
  $module: TModule['name']
  /**
   * Module state.
   */
  $state: ResolvedModuleState<TModule>
}

export type ModuleMutation<TMutation extends (...args: any[]) => unknown> = Brand<TMutation, 'rstore-module-mutation'> & MutationSpecialProps

export type CreateModuleApi<TModule extends Module> = TModule & {
  /**
   * The result of this function should be returned in `defineModule`. It resolves the module and exposes the passed properties to be used elsewhere in the application.
   */
  resolve: <const TModuleExposed extends Record<string, any>> (exposed: TModuleExposed) => ResolvedModule<TModule, TModuleExposed>

  /**
   * A module mutation is an augmented (possibly async) function that can be used to perform any action. It exposes additional properties and also integrates with various rstore systems such as the devtools.
   *
   * It's recommended that the arguments should be serializable to JSON to ensure compatibility with SSR and other future sync features.
   *
   * @returns The same function, but with additional properties.
   */
  defineMutation: <const TMutation extends (...args: any[]) => unknown> (mutation: TMutation) => ModuleMutation<TMutation>

  /**
   * Registers a (possibly async) callback that will be called when the module is resolved. This can be used to perform any action that needs to be done to initialize the module, for example, fetching data from an API.
   *
   * The module can then be awaited to wait for all `onResolve` callbacks to be completed. (You can still use the module without awaiting it, but the `onResolve` callbacks might not be completed yet.)
   */
  onResolve: (cb: () => Awaitable<unknown>) => void
}
