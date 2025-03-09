/* eslint-disable unused-imports/no-unused-vars */

import type { Model, ModelDefaults, ModelMap } from '@rstore/shared'

declare module '@rstore/vue' {
  export interface CustomModelMeta {
    path: string
  }

  export interface CustomFilterOption<
    TModel extends Model,
    TModelDefaults extends ModelDefaults,
    TModelMap extends ModelMap,
  > {
    email?: string
  }

  export interface CustomHookMeta {
    storeHistoryItem?: Pick<StoreHistoryItem, 'started'>
  }
}

export {}
