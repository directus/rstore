import type { Model, ModelDefaults, ResolvedModel, ResolvedModelItem, StandardSchemaV1, StoreSchema, WrappedItem, WrappedItemBase, WrappedItemUpdateFormOptions } from '@rstore/shared'
import type { VueModelApi } from './api'
import type { VueStore } from './store'
import { peekFirst, peekMany } from '@rstore/core'
import { markRaw } from 'vue'

export interface WrapItemOptions<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> {
  store: VueStore<TSchema, TModelDefaults>
  model: ResolvedModel<TModel, TModelDefaults, TSchema>
  item: ResolvedModelItem<TModel, TModelDefaults, TSchema>
}

export function wrapItem<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
>({
  store,
  model,
  item,
}: WrapItemOptions<TModel, TModelDefaults, TSchema>): WrappedItem<TModel, TModelDefaults, TSchema> {
  function getApi(): VueModelApi<TModel, TModelDefaults, TSchema, WrappedItem<TModel, TModelDefaults, TSchema>> {
    return store[model.name as keyof typeof store] as any
  }

  const proxy = new Proxy(item, {
    get: (target, key) => {
      switch (key) {
        case '$model':
          return (model.name) satisfies WrappedItemBase<TModel, TModelDefaults, TSchema>['$model']

        case '$getKey':
          return () => {
            const key = model.getKey(item)
            if (!key) {
              throw new Error('Key is undefined on item')
            }
            return key
          }

        case '$updateForm':
          return (async (options?: WrappedItemUpdateFormOptions<TModel, TModelDefaults, TSchema>) => {
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
          }) satisfies WrappedItemBase<TModel, TModelDefaults, TSchema>['$updateForm']

        case '$update':
          return ((data: Partial<ResolvedModelItem<TModel, TModelDefaults, TSchema>>) => {
            const key = model.getKey(item)
            return getApi().update(data, {
              key,
            })
          }) satisfies WrappedItemBase<TModel, TModelDefaults, TSchema>['$update']

        case '$delete':
          return (() => {
            const key = model.getKey(item)
            if (!key) {
              throw new Error('Key is required on item to delete')
            }
            return getApi().delete(key)
          }) satisfies WrappedItemBase<TModel, TModelDefaults, TSchema>['$delete']
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
            const values: Record<string, any> = {}
            const on = targetModelConfig.on as Record<string, string>
            for (const key in on) {
              const foreignKey = key.replace(`${targetModel.name}.`, '')
              const currentKey = on[key].replace(`${model.name}.`, '')
              values[foreignKey] = Reflect.get(proxy, currentKey)
            }
            const cacheResultForTarget = (relation.many ? peekMany : peekFirst)({
              store,
              model: targetModel,
              findOptions: {
                filter: (foreignItem) => {
                  for (const key in values) {
                    if (foreignItem[key] !== values[key]) {
                      return false
                    }
                  }
                  return true
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

  return proxy as WrappedItem<TModel, TModelDefaults, TSchema>
}

declare module '@rstore/shared' {
  export interface WrappedItemUpdateFormOptions<
    TModel extends Model = Model,
    TModelDefaults extends ModelDefaults = ModelDefaults,
    TSchema extends StoreSchema = StoreSchema,
  > {
    /**
     * Default values set in the form object initially and when it is reset.
     *
     * By default `updateForm` will initialize the fields with the existing item data.
     */
    defaultValues?: () => Partial<ResolvedModelItem<TModel, TModelDefaults, TSchema>>

    /**
     * Schema to validate the form object.
     *
     * @default model.schema.update
     */
    schema?: StandardSchemaV1
  }
}
