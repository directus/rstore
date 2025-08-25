import type { DefaultIsInstanceOf, Exactly, Full, GetKey, Model, ModelDefaults, ModelRelation, ModelRelationReference, ModelRelations, ModelSchemas, ResolvedModel, ResolvedModelList, StandardSchemaV1, StoreCore, StoreSchema } from '@rstore/shared'

export const defaultGetKey: GetKey<any> = (item: any) => item.id ?? item.__id

export const defaultIsInstanceOf: DefaultIsInstanceOf = model => item => item.__typename === model.name

/**
 * Allow typing the model item type thanks to currying.
 * @deprecated Use `withItemType().defineModel()` instead (or `RStoreSchema.withItemType().defineModel()` in Nuxt).
 */
export function defineItemType<
  TItem extends Record<string, any>,
>() {
  return {
    /**
     * Define a typed model.
     */
    model: <
      const TModel extends Exactly<Omit<Model<TItem>, '~type'>, TModel>,
    > (model: TModel): TModel & { '~type': 'model', '~item': TItem } => model as any,
  }
}

/**
 * Allow typing the model item type thanks to currying.
 */
export function withItemType<
  TItem extends Record<string, any>,
>(): {
  /**
   * Define a typed model.
   */
  defineModel: <const TModel extends Omit<Model<TItem>, '~type' | '~item'>> (model: TModel) => TModel & {
    '~type': undefined
    '~item': TItem
  }
} {
  return {
    defineModel: model => model as any,
  }
}

/**
 * Define an untyped model.
 */
export function defineDataModel(model: Model): Model {
  return model
}

export function defineRelations<TModel extends Model, const TRelations extends Record<string, ModelRelation<TModel>>>(
  model: TModel,
  relations: (payload: {
    model: <TTargetModel extends Model, T extends ModelRelationReference<TModel, TTargetModel>> (model: TTargetModel, relation: T) => { [key in TTargetModel['name']]: T & { '~model': TTargetModel } }
  }) => TRelations,
): ModelRelations<TModel, TRelations> {
  return {
    '~type': 'relation',
    model,
    'relations': relations({
      model: (model, relation) => ({
        [model.name]: relation,
      }) as any,
    }),
  }
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

export const emptySchemas: Full<ModelSchemas> = {
  create: emptySchema(),
  update: emptySchema(),
}

export function resolveModel<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
>(model: TModel, defaults?: TModelDefaults): ResolvedModel<TModel, TModelDefaults, TSchema> {
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
    '~resolved': true,
    'name': model.name,
    'getKey': item => (model.getKey ?? defaults?.getKey ?? defaultGetKey)(item),
    'isInstanceOf': item => model.isInstanceOf?.(item) || defaults?.isInstanceOf?.(model)(item) || defaultIsInstanceOf(model)(item),
    'relations': model.relations ?? {},
    'computed': {
      ...defaults?.computed,
      ...model.computed,
    },
    fields,
    'formSchema': {
      create: model.formSchema?.create ?? emptySchemas.create,
      update: model.formSchema?.update ?? emptySchemas.update,
    },
    'scopeId': model.scopeId,
    'meta': {
      ...defaults?.meta,
      ...model.meta,
    },
  }
}

export function isModel(item: any): item is Model {
  return item && (item['~type'] === 'model' || item['~type'] === undefined)
}

export function isModelRelations(item: any): item is ModelRelations {
  return item && item['~type'] === 'relation'
}

export function resolveModels<
  TSchema extends StoreSchema,
  TModelDefaults extends ModelDefaults,
>(schemaItems: TSchema, defaults?: TModelDefaults): ResolvedModelList<TSchema, TModelDefaults> {
  const resolved = [] as ResolvedModelList<TSchema, TModelDefaults>

  for (const item of schemaItems) {
    if (isModel(item)) {
      resolved.push(resolveModel(item, defaults))
    }
  }

  return resolved
}

export function addModelRelations<
  TSchema extends StoreSchema,
>(store: StoreCore<TSchema>, relations: ModelRelations): void {
  const model = store.$models.find(m => m.name === relations.model.name)
  if (!model) {
    throw new Error(`Model "${relations.model.name}" not found in store`)
  }
  model.relations ??= {}
  Object.assign(model.relations, relations.relations)
}
