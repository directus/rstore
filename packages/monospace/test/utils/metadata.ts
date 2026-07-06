import type { MonospaceSchemaMetadata } from '../../src/schema'

/**
 * Creates the Monospace schema metadata fixture matching the OpenAPI fixture
 * from `./openapi`.
 *
 * The raw item arrays mirror what `GET /api/{project}/items/{name}` returns
 * for the Monospace system schema meta collections:
 *
 * - `Todos.id` is a plain single-column primary key.
 * - `Orders` has a composite primary key (`shop_id`, `code`), in that order.
 * - `OrderItems` uses the non-`id` primary key `uuid`.
 * - `Todos.author` joins through `author_id` -> `Profiles.email` (a unique
 *   non-primary-key column); `Profiles.todos` is its backward side.
 * - `Profiles.avatar` joins through `avatar_id` -> `Todos.id`; its backward
 *   side (`Todos.avatarOf`) exists in the metadata but is not exposed in the
 *   OpenAPI document, covering metadata-only relations being ignored.
 * - `OrderItems.order` joins through the composite FK
 *   (`order_shop_id`, `order_code`) -> (`Orders.shop_id`, `Orders.code`).
 */
export function createSchemaMetadataFixture(): MonospaceSchemaMetadata {
  return {
    MonospaceCollection: [
      { id: 'c_todos', apiName: 'Todos' },
      { id: 'c_profiles', apiName: 'Profiles' },
      { id: 'c_orders', apiName: 'Orders' },
      { id: 'c_order_items', apiName: 'OrderItems' },
    ],
    MonospacePrimitiveField: [
      { id: 'pf_todos_id', apiName: 'id', collectionId: 'c_todos' },
      { id: 'pf_todos_title', apiName: 'title', collectionId: 'c_todos' },
      { id: 'pf_todos_completed', apiName: 'completed', collectionId: 'c_todos' },
      { id: 'pf_todos_description', apiName: 'description', collectionId: 'c_todos' },
      { id: 'pf_todos_author_id', apiName: 'author_id', collectionId: 'c_todos' },
      { id: 'pf_profiles_id', apiName: 'id', collectionId: 'c_profiles' },
      { id: 'pf_profiles_name', apiName: 'name', collectionId: 'c_profiles' },
      { id: 'pf_profiles_email', apiName: 'email', collectionId: 'c_profiles' },
      { id: 'pf_profiles_avatar_id', apiName: 'avatar_id', collectionId: 'c_profiles' },
      { id: 'pf_orders_shop_id', apiName: 'shop_id', collectionId: 'c_orders' },
      { id: 'pf_orders_code', apiName: 'code', collectionId: 'c_orders' },
      { id: 'pf_orders_label', apiName: 'label', collectionId: 'c_orders' },
      { id: 'pf_oi_uuid', apiName: 'uuid', collectionId: 'c_order_items' },
      { id: 'pf_oi_order_shop_id', apiName: 'order_shop_id', collectionId: 'c_order_items' },
      { id: 'pf_oi_order_code', apiName: 'order_code', collectionId: 'c_order_items' },
      { id: 'pf_oi_qty', apiName: 'qty', collectionId: 'c_order_items' },
    ],
    MonospaceSingleRelationField: [
      {
        id: 'rf_todos_author',
        apiName: 'author',
        collectionId: 'c_todos',
        oppositeCollectionId: 'c_profiles',
        isList: false,
        isNullable: true,
        constraintId: 'ct_author',
        oppositeRelationFieldId: 'rf_profiles_todos',
      },
      {
        id: 'rf_profiles_todos',
        apiName: 'todos',
        collectionId: 'c_profiles',
        oppositeCollectionId: 'c_todos',
        isList: true,
        isNullable: false,
        constraintId: null,
        oppositeRelationFieldId: 'rf_todos_author',
      },
      {
        id: 'rf_profiles_avatar',
        apiName: 'avatar',
        collectionId: 'c_profiles',
        oppositeCollectionId: 'c_todos',
        isList: false,
        isNullable: false,
        constraintId: 'ct_avatar',
        oppositeRelationFieldId: 'rf_todos_avatar_of',
      },
      // Backward side of Profiles.avatar, not exposed in the OpenAPI output.
      {
        id: 'rf_todos_avatar_of',
        apiName: 'avatarOf',
        collectionId: 'c_todos',
        oppositeCollectionId: 'c_profiles',
        isList: true,
        isNullable: false,
        constraintId: null,
        oppositeRelationFieldId: 'rf_profiles_avatar',
      },
      {
        id: 'rf_orders_items',
        apiName: 'items',
        collectionId: 'c_orders',
        oppositeCollectionId: 'c_order_items',
        isList: true,
        isNullable: false,
        constraintId: null,
        oppositeRelationFieldId: 'rf_oi_order',
      },
      {
        id: 'rf_oi_order',
        apiName: 'order',
        collectionId: 'c_order_items',
        oppositeCollectionId: 'c_orders',
        isList: false,
        isNullable: false,
        constraintId: 'ct_order',
        oppositeRelationFieldId: 'rf_orders_items',
      },
    ],
    MonospaceSingleConstraintField: [
      {
        constraintId: 'ct_author',
        constrainedFieldId: 'pf_todos_author_id',
        referencedFieldId: 'pf_profiles_email',
        order: 0,
      },
      {
        constraintId: 'ct_avatar',
        constrainedFieldId: 'pf_profiles_avatar_id',
        referencedFieldId: 'pf_todos_id',
        order: 0,
      },
      {
        constraintId: 'ct_order',
        constrainedFieldId: 'pf_oi_order_shop_id',
        referencedFieldId: 'pf_orders_shop_id',
        order: 0,
      },
      {
        constraintId: 'ct_order',
        constrainedFieldId: 'pf_oi_order_code',
        referencedFieldId: 'pf_orders_code',
        order: 1,
      },
    ],
    MonospaceIndex: [
      { id: 'ix_todos_pk', kind: 'primary', collectionId: 'c_todos' },
      { id: 'ix_profiles_pk', kind: 'primary', collectionId: 'c_profiles' },
      { id: 'ix_profiles_email', kind: 'unique', collectionId: 'c_profiles' },
      { id: 'ix_orders_pk', kind: 'primary', collectionId: 'c_orders' },
      { id: 'ix_oi_pk', kind: 'primary', collectionId: 'c_order_items' },
    ],
    MonospaceIndexField: [
      { indexId: 'ix_todos_pk', fieldId: 'pf_todos_id', order: 0 },
      { indexId: 'ix_profiles_pk', fieldId: 'pf_profiles_id', order: 0 },
      { indexId: 'ix_profiles_email', fieldId: 'pf_profiles_email', order: 0 },
      // Composite primary key: order defines the getKey field order.
      { indexId: 'ix_orders_pk', fieldId: 'pf_orders_shop_id', order: 0 },
      { indexId: 'ix_orders_pk', fieldId: 'pf_orders_code', order: 1 },
      { indexId: 'ix_oi_pk', fieldId: 'pf_oi_uuid', order: 0 },
    ],
  }
}
