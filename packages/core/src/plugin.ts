import type { Model, ModelDefaults, Plugin, Store } from '@rstore/shared'

export async function setupPlugin<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
>(store: Store<TModel, TModelDefaults>, plugin: Plugin) {
  await plugin.setup({
    hook: store.hooks.hook,
  })
}
