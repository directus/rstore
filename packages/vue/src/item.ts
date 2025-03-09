import type { Model, ModelDefaults, ModelMap, ResolvedModel, ResolvedModelItem, WrappedItem, WrappedItemBase, WrappedItemEditOptions } from '@rstore/shared'
import type { VueModelApi } from './api'
import type { VueStore } from './store'
import { peekFirst, peekMany } from '@rstore/core'

export interface WrapItemOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelMap extends ModelMap,
> {
  store: VueStore<TModelMap, TModelDefaults>
  model: ResolvedModel<TModel, TModelDefaults, TModelMap>
  item: ResolvedModelItem<TModel, TModelDefaults, TModelMap>
}

export function wrapItem<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelMap extends ModelMap,
>({
  store,
  model,
  item,
}: WrapItemOptions<TModel, TModelDefaults, TModelMap>): WrappedItemBase<TModel, TModelDefaults, TModelMap> {
  function getApi(): VueModelApi<TModel, TModelDefaults, TModelMap, WrappedItem<TModel, TModelDefaults, TModelMap>> {
    return store[model.name]
  }

  const proxy = new Proxy(item, {
    get: (target, key) => {
      switch (key) {
        case '$model':
          return (model.name) satisfies WrappedItemBase<TModel, TModelDefaults, TModelMap>['$model']

        case '$updateForm':
          return ((options?: WrappedItemEditOptions<TModel, TModelDefaults, TModelMap>) => {
            const key = model.getKey(item)
            if (!key) {
              throw new Error('Key is required on item to update')
            }
            const form = getApi().updateForm({
              key,
            }, {
              defaultValues: options?.defaultValues,
            })
            return form
          }) satisfies WrappedItemBase<TModel, TModelDefaults, TModelMap>['$updateForm']

        case '$update':
          return ((data: Partial<ResolvedModelItem<TModel, TModelDefaults, TModelMap>>) => {
            const key = model.getKey(item)
            return getApi().update(data, {
              key,
            })
          }) satisfies WrappedItemBase<TModel, TModelDefaults, TModelMap>['$update']

        case '$delete':
          return (() => {
            const key = model.getKey(item)
            if (!key) {
              throw new Error('Key is required on item to delete')
            }
            return getApi().delete(key)
          }) satisfies WrappedItemBase<TModel, TModelDefaults, TModelMap>['$delete']
      }

      // Resolve computed properties
      if (key in model.computed) {
        return model.computed[key as string](proxy)
      }

      // Resolve related items in the cache
      if (key in model.relations) {
        if (Reflect.has(target, key)) {
          // @TODO resolve references
          return Reflect.get(target, key)
        }
        else {
          const relation = model.relations[key as string]
          const result: Array<any> = []
          for (const targetModelName in relation.to) {
            const targetModel = relation.to[targetModelName]
            const targetType = store.models[targetModelName]
            const value = Reflect.get(proxy, targetModel.eq)
            const cacheResultForTarget = (relation.many ? peekMany : peekFirst)({
              store,
              model: targetType,
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
    TModel extends Model = Model,
    TModelDefaults extends ModelDefaults = ModelDefaults,
    TModelMap extends ModelMap = ModelMap,
  > {
    /**
     * Default values set in the form object initially and when it is reset.
     *
     * By default `updateForm` will initialize the fields with the existing item data.
     */
    defaultValues?: () => Partial<ResolvedModelItem<TModel, TModelDefaults, TModelMap>>
  }
}
