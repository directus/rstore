import type { MutationSpecialProps } from './mutation'
import type { Awaitable, Brand } from './utils'

export interface Module {
  name: string
  state: Record<string, any>
}

export type ResolvedModuleState<TModule extends Module> = TModule['state']

export type ResolvedModule<
  TModule extends Module,
  TModuleExposed extends Record<string, any>,
> = TModuleExposed & {
  $module: TModule['name']
  $state: ResolvedModuleState<TModule>
}

export type ModuleMutation<TMutation extends (...args: any[]) => unknown> = Brand<TMutation, 'rstore-module-mutation'> & MutationSpecialProps

export type CreateModuleApi<TModule extends Module> = TModule & {
  resolve: <const TModuleExposed extends Record<string, any>> (exposed: TModuleExposed) => ResolvedModule<TModule, TModuleExposed>
  defineMutation: <const TMutation extends (...args: any[]) => unknown> (mutation: TMutation) => ModuleMutation<TMutation>
  onResolve: (cb: () => Awaitable<unknown>) => void
}
