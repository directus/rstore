import { type GetKey, type ModelDefaults, type ModelType, type ResolvedModel, todo } from '@rstore/shared'

export const defaultGetKey: GetKey<any> = (item: any) => item.id ?? item.__id

export function defineModelType<
  TItem extends Record<string, any>,
  TComputed extends Record<string, any> = any,
  TModelType extends ModelType<TItem, TComputed> = ModelType<TItem, TComputed>,
>(model: TModelType): TModelType {
  return model
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
      key: type.key ?? defaults?.key ?? defaultGetKey,
      relations: type.relations?.map(relation => ({
        name: relation.name,
        type: relation.type,
        model: relation.model,
        field: relation.field ?? todo('guess relation field'), // @TODO guess field
        reference: relation.reference ?? todo('guess relation reference'), // @TODO guess reference
      })) ?? [],
      computed: {
        ...defaults?.computed,
        ...type.computed,
      },
      fields,
      meta: {
        ...defaults?.meta,
        ...type.meta,
      },
    }
  }
  return resolved
}
