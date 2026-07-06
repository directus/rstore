/**
 * Creates a compact Monospace OpenAPI fixture for schema tests.
 *
 * Relation field shapes mirror real Monospace OpenAPI documents:
 * to-one fields are `oneOf: [$ref, null]` (or a bare `$ref` when not
 * nullable), to-many fields are `{ data: [$ref] }` envelopes, and the
 * foreign key columns backing relations are exposed as plain output
 * properties (for example `author_id` next to `author`).
 *
 * Connect key input schemas mirror the engine naming convention
 * (`{collection}{relationField}ConnectForwardKeyInput` and
 * `{collection}{relationField}ConnectBackwardKeysInput`). The `Todos.author`
 * relation intentionally joins through the non-primary-key `email` column
 * (its FK constraint references `Profiles.email`). The `Profiles.avatar`
 * relation has no connect input schema so the constraint-column fallback
 * stays covered.
 *
 * The fixture pairs with {@link createSchemaMetadataFixture} from
 * `./metadata`, which describes the same collections with primary indexes
 * (`Orders` composite, `OrderItems` non-`id`) and FK constraints.
 */
export function createOpenApiFixture(): any {
  return {
    'openapi': '3.1.0',
    'paths': {},
    'x-monospace-mappings': {
      Todos: {
        many: {
          $ref: '#/paths/~1api~1blog~1items~1Todos',
        },
        one: {
          $ref: '#/paths/~1api~1blog~1items~1Todos~1%7Bkey%7D',
        },
      },
      Profiles: {
        many: {
          $ref: '#/paths/~1api~1blog~1items~1Profiles',
        },
      },
      Orders: {
        many: {
          $ref: '#/paths/~1api~1blog~1items~1Orders',
        },
      },
      OrderItems: {
        many: {
          $ref: '#/paths/~1api~1blog~1items~1OrderItems',
        },
      },
    },
    'components': {
      schemas: {
        TodosCollectionOutput: {
          required: ['id', 'title', 'completed'],
          type: 'object',
          properties: {
            id: {
              type: 'integer',
            },
            title: {
              type: 'string',
            },
            completed: {
              type: 'boolean',
            },
            description: {
              anyOf: [
                { type: 'string' },
                { type: 'null' },
              ],
            },
            author_id: {
              oneOf: [
                { type: 'string' },
                { type: 'null' },
              ],
            },
            author: {
              oneOf: [
                { $ref: '#/components/schemas/ProfilesCollectionOutput' },
                { type: 'null' },
              ],
            },
            attachment: {
              $ref: '#/components/schemas/AttachmentOutput',
            },
          },
        },
        ProfilesCollectionOutput: {
          required: ['id', 'email'],
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            name: {
              type: 'string',
            },
            email: {
              type: 'string',
            },
            avatar_id: {
              type: 'integer',
            },
            avatar: {
              $ref: '#/components/schemas/TodosCollectionOutput',
            },
            todos: {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/TodosCollectionOutput',
                  },
                },
              },
              required: ['data'],
            },
          },
        },
        OrdersCollectionOutput: {
          required: ['shop_id', 'code'],
          type: 'object',
          properties: {
            shop_id: {
              type: 'integer',
            },
            code: {
              type: 'string',
            },
            label: {
              type: 'string',
            },
            items: {
              type: 'object',
              properties: {
                data: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/OrderItemsCollectionOutput',
                  },
                },
              },
              required: ['data'],
            },
          },
        },
        OrderItemsCollectionOutput: {
          required: ['uuid', 'order_shop_id', 'order_code'],
          type: 'object',
          properties: {
            uuid: {
              type: 'string',
            },
            order_shop_id: {
              type: 'integer',
            },
            order_code: {
              type: 'string',
            },
            qty: {
              type: 'integer',
            },
            order: {
              $ref: '#/components/schemas/OrdersCollectionOutput',
            },
          },
        },
        AttachmentOutput: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
            },
          },
        },
        // Forward to-one connect key input joining through a non-PK column.
        TodosauthorConnectForwardKeyInput: {
          type: 'object',
          properties: {
            email: {
              type: 'string',
            },
          },
          required: ['email'],
        },
        // Backward to-many connect keys input listing unique columns.
        ProfilestodosConnectBackwardKeysInput: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
            },
          },
          required: [],
        },
        // Composite forward connect key input for OrderItems.order.
        OrderItemsorderConnectForwardKeyInput: {
          type: 'object',
          properties: {
            shop_id: {
              type: 'integer',
            },
            code: {
              type: 'string',
            },
          },
          required: ['shop_id', 'code'],
        },
        // Backward connect keys input keyed by the non-`id` primary key.
        OrdersitemsConnectBackwardKeysInput: {
          type: 'object',
          properties: {
            uuid: {
              type: 'string',
            },
          },
          required: [],
        },
      },
    },
  }
}
