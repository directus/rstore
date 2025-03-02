/* eslint-disable unused-imports/no-unused-vars */

import type { Model, ModelDefaults, ModelType } from '@rstore/shared'

declare module '@rstore/vue' {
  export interface CustomModelTypeMeta {
    path: string
  }

  export interface CustomFilterOption<
    TModelType extends ModelType,
    TModelDefaults extends ModelDefaults,
    TModel extends Model,
  > {
    email?: string
  }

  export interface CustomHookMeta {
    storeHistoryItem?: Pick<StoreHistoryItem, 'started'>
  }
}

export {}
