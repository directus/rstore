import type { DefaultIsInstanceOf, Full, GetKey, Model, ModelDefaults, ModelList, ModelSchemas, ResolvedModelList } from '@rstore/shared'

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
export function defineDataModel(model: Model): Model {
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
  TModelList extends ModelList,
  TModelDefaults extends ModelDefaults,
>(models: TModelList, defaults?: TModelDefaults): ResolvedModelList<TModelList, TModelDefaults> {
  const resolved = [] as ResolvedModelList<TModelList, TModelDefaults>

  for (const model of models) {
    if (model.name.startsWith('$')) {
      throw new Error(`Model name "${model.name}" cannot start with "$"`)
    }

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

    resolved.push({
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
    })
  }
  return resolved
}
