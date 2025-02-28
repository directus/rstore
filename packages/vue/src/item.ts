import type { Model, ModelDefaults, ModelType, ResolvedModelItem, ResolvedModelType, WrappedItem, WrappedItemEditOptions } from '@rstore/shared'
import type { VueModelApi } from './api'
import type { VueStore } from './store'

export interface WrapItemOptions<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
> {
  store: VueStore<TModel, TModelDefaults>
  type: ResolvedModelType<TModelType, TModelDefaults>
  item: ResolvedModelItem<TModelType, TModelDefaults, TModel>
}

export function wrapItem<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
>({
  store,
  type,
  item,
}: WrapItemOptions<TModelType, TModelDefaults, TModel>): WrappedItem<TModelType, TModelDefaults, TModel> {
  function getApi(): VueModelApi<TModelType, TModelDefaults, TModel, WrappedItem<TModelType, TModelDefaults, TModel>> {
    return store[type.name]
  }

  const proxy = new Proxy(item, {
    get: (target, key) => {
      switch (key) {
        case '$type':
          return (type.name) satisfies WrappedItem<TModelType, TModelDefaults, TModel>['$type']

        case '$updateForm':
          return ((options?: WrappedItemEditOptions<TModelType, TModelDefaults, TModel>) => {
            const key = type.getKey(item)
            if (!key) {
              throw new Error('Key is required on item to update')
            }
            const form = getApi().updateForm({
              key,
            }, {
              defaultValues: options?.defaultValues,
            })
            return form
          }) satisfies WrappedItem<TModelType, TModelDefaults, TModel>['$updateForm']

        case '$update':
          return ((data: Partial<ResolvedModelItem<TModelType, TModelDefaults, TModel>>) => {
            const key = type.getKey(item)
            return getApi().update(data, {
              key,
            })
          }) satisfies WrappedItem<TModelType, TModelDefaults, TModel>['$update']

        case '$delete':
          return (() => {
            const key = type.getKey(item)
            if (!key) {
              throw new Error('Key is required on item to delete')
            }
            return getApi().delete(key)
          }) satisfies WrappedItem<TModelType, TModelDefaults, TModel>['$delete']
      }

      return Reflect.get(target, key)
    },

    set: () => {
      throw new Error('Items are read-only. Use `item.$updateForm()` to update the item.')
    },
  })

  return proxy
}

declare module '@rstore/shared' {
  export interface WrappedItemEditOptions<
    TModelType extends ModelType = ModelType,
    TModelDefaults extends ModelDefaults = ModelDefaults,
    TModel extends Model = Model,
  > {
    /**
     * Default values set in the form object initially and when it is reset.
     *
     * By default `updateForm` will initialize the fields with the existing item data.
     */
    defaultValues?: () => Partial<ResolvedModelItem<TModelType, TModelDefaults, TModel>>
  }
}
