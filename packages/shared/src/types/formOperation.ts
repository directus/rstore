/**
 * Type of operation performed on a form field.
 * - `set`: A regular field value change, or replacing all items in a many-relation.
 * - `connect`: Connecting a related item (relation fields only).
 * - `disconnect`: Disconnecting a related item (relation fields only).
 */
export type FormOperationType = 'set' | 'connect' | 'disconnect'

/**
 * Represents a single operation recorded in the form's operation log.
 * This includes regular field edits as well as relational operations
 * (connect, disconnect, set on relation fields).
 *
 * Plugins can use these operations to handle relational edits
 * (e.g. updating junction tables, managing foreign keys)
 * during `createItem` and `updateItem` hooks.
 */
export interface FormOperation<TData extends Record<string, any> = Record<string, any>> {
  /**
   * Timestamp when the operation was recorded.
   */
  timestamp: number
  /**
   * Field name that was changed.
   */
  field: keyof TData
  /**
   * Type of operation performed.
   */
  type: FormOperationType
  /**
   * New value of the field.
   * - For `set`: the new field value.
   * - For `connect`: the partial item to connect.
   * - For `disconnect`: undefined (or empty array for many-relations disconnect-all).
   */
  newValue: any
  /**
   * Old value of the field.
   * - For `set`: the previous field value.
   * - For `connect`: undefined.
   * - For `disconnect`: the partial item being disconnected (or the previous array for disconnect-all).
   */
  oldValue: any
}
