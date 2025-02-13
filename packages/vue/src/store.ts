import { createStore as _createStore } from '@rstore/core'
import { createHooks, type FindOptions, type Model, type ModelDefaults, type Plugin, type Store } from '@rstore/shared'
import { createCache } from './cache'

export interface CreateStoreOptions<
  TModel extends Model = Model,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> {
  model: TModel
  modelDefaults?: TModelDefaults
  plugins: Array<Plugin>
  findDefaults?: Partial<FindOptions<any, any, any>>
}

export async function createStore<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
>(options: CreateStoreOptions<TModel, TModelDefaults>): Promise<Store<TModel, TModelDefaults>> {
  const store = await _createStore({
    model: options.model,
    modelDefaults: options.modelDefaults,
    plugins: options.plugins,
    cache: createCache(),
    hooks: createHooks(),
    findDefaults: options.findDefaults,
  })

  return store
}
