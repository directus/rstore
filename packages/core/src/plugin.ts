import type { Model, ModelDefaults, Plugin, StoreCore } from '@rstore/shared'

export async function setupPlugin<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
>(store: StoreCore<TModel, TModelDefaults>, plugin: Plugin) {
  await plugin.setup({
    hook: store.hooks.hook,
  })
}
