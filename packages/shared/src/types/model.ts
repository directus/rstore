export interface Model<TItem = any> {
  /**
   * Name of the model.
   *
   * @example "User"
   */
  name: string

  /**
   * Compute the id of the item. By default it returns the `id` or `_id` field.
   * @param item The item to compute the id from
   * @returns The unique data id of the item
   *
   * @example
   *
   * ```ts
   * id: (item) => [item.postId, item.authorId].join(':')
   * ```
   */
  id?: (item: TItem) => string

  /**
   * Relations to other models.
   */
  relations?: Array<ModelRelation>
}

/**
 * Default values for any model.
 */
export type ModelDefaults = Partial<Pick<Model, 'id'>>

export interface ModelRelation {
  /**
   * Type of the relation.
   *
   * `one` means that the current model has a single reference to the target model.
   *
   * `many` means that the current model has multiple references to the target model.
   */
  type: 'one' | 'many'

  /**
   * Name of the target model.
   */
  model: string

  /**
   * Field name on the current model.
   */
  field?: string

  /**
   * Field name on the target model.
   */
  reference?: string
}

export interface ResolvedModel<TItem = any> {
  name: string
  id: (item: TItem) => string
  relations: Array<ResolvedModelRelation>
}

export interface ResolvedModelRelation {
  type: 'one' | 'many'
  model: string
  field: string
  reference: string
}
