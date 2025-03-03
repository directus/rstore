import type { DefaultIsInstanceOf, Full, GetKey, ModelDefaults, ModelType, ModelTypeSchemas, ResolvedModel } from '@rstore/shared'

export const defaultGetKey: GetKey<any> = (item: any) => item.id ?? item.__id

export const defaultIsInstanceOf: DefaultIsInstanceOf = type => item => item.__typename === type.name

/**
 * Allow typing the model item type thanks to currying.
 */
export function defineItemType<
  TItem extends Record<string, any>,
>() {
  return {
    /**
     * Define a typed model type.
     */
    modelType: <
      TComputed extends Record<string, any>,
      TSchemas extends ModelTypeSchemas,
      TModelType extends ModelType<TItem, TComputed, TSchemas> = ModelType<TItem, TComputed, TSchemas>,
    > (model: TModelType): TModelType & { '~item': TItem } => model as any,
  }
}

/**
 * Define an untyped model type.
 */
export function defineModelType(model: ModelType): ModelType {
  return model
}

const emptySchemas: Full<ModelTypeSchemas> = {
  create: {
    '~standard': {
      validate: value => ({ value }),
      vendor: 'rstore',
      version: 1,
    },
  },
  update: {
    '~standard': {
      validate: value => ({ value }),
      vendor: 'rstore',
      version: 1,
    },
  },
}

export function resolveModel<
  TModelTypes extends Record<string, ModelType>,
  TModelDefaults extends ModelDefaults,
>(types: TModelTypes, defaults?: TModelDefaults): ResolvedModel<TModelTypes, TModelDefaults> {
  const resolved = {} as ResolvedModel<TModelTypes, TModelDefaults>

  for (const key in types) {
    const type = types[key]

    const fields = defaults?.fields ?? {}
    if (type.fields) {
      for (const path in type.fields) {
        if (fields[path]) {
          Object.assign(fields[path], type.fields[path])
        }
        else {
          fields[path] = type.fields[path]
        }
      }
    }

    resolved[key] = {
      name: type.name,
      getKey: item => (type.getKey ?? defaults?.getKey ?? defaultGetKey)(item),
      isInstanceOf: item => type.isInstanceOf?.(item) || defaults?.isInstanceOf?.(type)(item) || defaultIsInstanceOf(type)(item),
      relations: type.relations ?? {},
      computed: {
        ...defaults?.computed,
        ...type.computed,
      },
      fields,
      schema: {
        create: type.schema?.create ?? emptySchemas.create,
        update: type.schema?.update ?? emptySchemas.update,
      },
      meta: {
        ...defaults?.meta,
        ...type.meta,
      },
    }
  }
  return resolved
}
