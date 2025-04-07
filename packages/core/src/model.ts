import type { DefaultIsInstanceOf, Exactly, Full, GetKey, Model, ModelDefaults, ModelList, ModelSchemas, ResolvedModel, ResolvedModelList, StandardSchemaV1 } from '@rstore/shared'

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
      const TModel extends Exactly<Model<TItem>, TModel>,
    > (model: TModel): TModel & { '~item': TItem } => model as any,
  }
}

/**
 * Define an untyped model.
 */
export function defineDataModel(model: Model): Model {
  return model
}

export function emptySchema(): StandardSchemaV1 {
  return {
    '~standard': {
      validate: value => ({ value }),
      vendor: 'rstore',
      version: 1,
    },
  }
}

const emptySchemas: Full<ModelSchemas> = {
  create: emptySchema(),
  update: emptySchema(),
}

export function resolveModel<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
>(model: TModel, defaults?: TModelDefaults): ResolvedModel<TModel, TModelDefaults, TModelList> {
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

  return {
    name: model.name,
    getKey: item => (model.getKey ?? defaults?.getKey ?? defaultGetKey)(item),
    isInstanceOf: item => model.isInstanceOf?.(item) || defaults?.isInstanceOf?.(model)(item) || defaultIsInstanceOf(model)(item),
    relations: model.relations ?? {},
    computed: {
      ...defaults?.computed,
      ...model.computed,
    },
    fields,
    formSchema: {
      create: model.formSchema?.create ?? emptySchemas.create,
      update: model.formSchema?.update ?? emptySchemas.update,
    },
    scopeId: model.scopeId,
    meta: {
      ...defaults?.meta,
      ...model.meta,
    },
  }
}

export function resolveModels<
  TModelList extends ModelList,
  TModelDefaults extends ModelDefaults,
>(models: TModelList, defaults?: TModelDefaults): ResolvedModelList<TModelList, TModelDefaults> {
  const resolved = [] as ResolvedModelList<TModelList, TModelDefaults>

  for (const model of models) {
    resolved.push(resolveModel(model, defaults))
  }
  return resolved
}
