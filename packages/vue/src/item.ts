import type { Model, ModelDefaults, ModelList, ResolvedModel, ResolvedModelItem, StandardSchemaV1, WrappedItem, WrappedItemBase, WrappedItemUpdateFormOptions } from '@rstore/shared'
import type { VueModelApi } from './api'
import type { VueStore } from './store'
import { peekFirst, peekMany } from '@rstore/core'
import { markRaw } from 'vue'

export interface WrapItemOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> {
  store: VueStore<TModelList, TModelDefaults>
  model: ResolvedModel<TModel, TModelDefaults, TModelList>
  item: ResolvedModelItem<TModel, TModelDefaults, TModelList>
}

export function wrapItem<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
>({
  store,
  model,
  item,
}: WrapItemOptions<TModel, TModelDefaults, TModelList>): WrappedItemBase<TModel, TModelDefaults, TModelList> {
  function getApi(): VueModelApi<TModel, TModelDefaults, TModelList, WrappedItem<TModel, TModelDefaults, TModelList>> {
    return store[model.name as keyof typeof store] as any
  }

  const proxy = new Proxy(item, {
    get: (target, key) => {
      switch (key) {
        case '$model':
          return (model.name) satisfies WrappedItemBase<TModel, TModelDefaults, TModelList>['$model']

        case '$getKey':
          return () => {
            const key = model.getKey(item)
            if (!key) {
              throw new Error('Key is undefined on item')
            }
            return key
          }

        case '$updateForm':
          return (async (options?: WrappedItemUpdateFormOptions<TModel, TModelDefaults, TModelList>) => {
            const key = model.getKey(item)
            if (!key) {
              throw new Error('Key is required on item to update')
            }
            const form = await getApi().updateForm({
              key,
            }, {
              defaultValues: options?.defaultValues,
            })
            if (options?.schema) {
              form.$schema = markRaw(options.schema)
            }
            return form
          }) satisfies WrappedItemBase<TModel, TModelDefaults, TModelList>['$updateForm']

        case '$update':
          return ((data: Partial<ResolvedModelItem<TModel, TModelDefaults, TModelList>>) => {
            const key = model.getKey(item)
            return getApi().update(data, {
              key,
            })
          }) satisfies WrappedItemBase<TModel, TModelDefaults, TModelList>['$update']

        case '$delete':
          return (() => {
            const key = model.getKey(item)
            if (!key) {
              throw new Error('Key is required on item to delete')
            }
            return getApi().delete(key)
          }) satisfies WrappedItemBase<TModel, TModelDefaults, TModelList>['$delete']
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
            const targetModelConfig = relation.to[targetModelName]
            const targetModel = store.$models.find(m => m.name === targetModelName)
            if (!targetModel) {
              throw new Error(`Model "${targetModelName}" does not exist in the store`)
            }
            const value = Reflect.get(proxy, targetModelConfig.eq)
            const cacheResultForTarget = (relation.many ? peekMany : peekFirst)({
              store,
              model: targetModel,
              findOptions: {
                filter: (foreignItem) => {
                  if (Array.isArray(value)) {
                    return value.includes(foreignItem[targetModelConfig.on])
                  }
                  return foreignItem[targetModelConfig.on] === value
                },
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
  export interface WrappedItemUpdateFormOptions<
    TModel extends Model = Model,
    TModelDefaults extends ModelDefaults = ModelDefaults,
    TModelList extends ModelList = ModelList,
  > {
    /**
     * Default values set in the form object initially and when it is reset.
     *
     * By default `updateForm` will initialize the fields with the existing item data.
     */
    defaultValues?: () => Partial<ResolvedModelItem<TModel, TModelDefaults, TModelList>>

    /**
     * Schema to validate the form object.
     *
     * @default model.schema.update
     */
    schema?: StandardSchemaV1
  }
}
