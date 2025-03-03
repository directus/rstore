import type { Model, ModelDefaults, ModelType, ResolvedModelItem, ResolvedModelType, WrappedItem, WrappedItemBase, WrappedItemEditOptions } from '@rstore/shared'
import type { VueModelApi } from './api'
import type { VueStore } from './store'
import { peekFirst, peekMany } from '@rstore/core'

export interface WrapItemOptions<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
> {
  store: VueStore<TModel, TModelDefaults>
  type: ResolvedModelType<TModelType, TModelDefaults, TModel>
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
}: WrapItemOptions<TModelType, TModelDefaults, TModel>): WrappedItemBase<TModelType, TModelDefaults, TModel> {
  function getApi(): VueModelApi<TModelType, TModelDefaults, TModel, WrappedItem<TModelType, TModelDefaults, TModel>> {
    return store[type.name]
  }

  const proxy = new Proxy(item, {
    get: (target, key) => {
      switch (key) {
        case '$type':
          return (type.name) satisfies WrappedItemBase<TModelType, TModelDefaults, TModel>['$type']

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
          }) satisfies WrappedItemBase<TModelType, TModelDefaults, TModel>['$updateForm']

        case '$update':
          return ((data: Partial<ResolvedModelItem<TModelType, TModelDefaults, TModel>>) => {
            const key = type.getKey(item)
            return getApi().update(data, {
              key,
            })
          }) satisfies WrappedItemBase<TModelType, TModelDefaults, TModel>['$update']

        case '$delete':
          return (() => {
            const key = type.getKey(item)
            if (!key) {
              throw new Error('Key is required on item to delete')
            }
            return getApi().delete(key)
          }) satisfies WrappedItemBase<TModelType, TModelDefaults, TModel>['$delete']
      }

      // Resolve computed properties
      if (key in type.computed) {
        return type.computed[key as string](proxy)
      }

      // Resolve related items in the cache
      if (key in type.relations) {
        if (Reflect.has(target, key)) {
          // @TODO resolve references
          return Reflect.get(target, key)
        }
        else {
          const relation = type.relations[key as string]
          const result: Array<any> = []
          for (const targetModelName in relation.to) {
            const targetModel = relation.to[targetModelName]
            const targetType = store._core.model[targetModelName]
            const value = Reflect.get(proxy, targetModel.eq)
            const cacheResultForTarget = (relation.many ? peekMany : peekFirst)({
              store: store._core,
              type: targetType,
              findOptions: {
                filter: foreignItem => foreignItem[targetModel.on] === value,
              },
              force: true,
            }).result
            if (Array.isArray(cacheResultForTarget)) {
              result.push(...cacheResultForTarget)
            }
            else if (cacheResultForTarget) {
              result.push(cacheResultForTarget)
              break
            }
          }

          if (relation.many) {
            return result
          }
          else {
            return result[0]
          }
        }
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
