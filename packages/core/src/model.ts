import type { DefaultIsInstanceOf, Full, GetKey, Model, ModelDefaults, ModelSchemas, ResolvedModelMap } from '@rstore/shared'

export const defaultGetKey: GetKey<any> = (item: any) => item.id ?? item.__id

export const defaultIsInstanceOf: DefaultIsInstanceOf = model => item => item.__typename === model.name

/**
 * Allow typing the model item type thanks to currying.
 */
export function defineItemType<
  TItem extends Record<string, any>,
>() {
  return {
    /**
     * Define a typed model.
     */
    model: <
      TComputed extends Record<string, any>,
      TSchemas extends ModelSchemas,
      TModel extends Model<TItem, TComputed, TSchemas> = Model<TItem, TComputed, TSchemas>,
    > (model: TModel): TModel & { '~item': TItem } => model as any,
  }
}

/**
 * Define an untyped model.
 */
export function defineModel(model: Model): Model {
  return model
}

const emptySchemas: Full<ModelSchemas> = {
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

export function resolveModels<
  TModelMap extends Record<string, Model>,
  TModelDefaults extends ModelDefaults,
>(models: TModelMap, defaults?: TModelDefaults): ResolvedModelMap<TModelMap, TModelDefaults> {
  const resolved = {} as ResolvedModelMap<TModelMap, TModelDefaults>

  for (const key in models) {
    const model = models[key]

    const fields = defaults?.fields ?? {}
    if (model.fields) {
      for (const path in model.fields) {
        if (fields[path]) {
          Object.assign(fields[path], model.fields[path])
        }
        else {
          fields[path] = model.fields[path]
        }
      }
    }

    resolved[key] = {
      name: model.name,
      getKey: item => (model.getKey ?? defaults?.getKey ?? defaultGetKey)(item),
      isInstanceOf: item => model.isInstanceOf?.(item) || defaults?.isInstanceOf?.(model)(item) || defaultIsInstanceOf(model)(item),
      relations: model.relations ?? {},
      computed: {
        ...defaults?.computed,
        ...model.computed,
      },
      fields,
      schema: {
        create: model.schema?.create ?? emptySchemas.create,
        update: model.schema?.update ?? emptySchemas.update,
      },
      meta: {
        ...defaults?.meta,
        ...model.meta,
      },
    }
  }
  return resolved
}
