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
 * Collection paths cover item routes and operations: `Orders` (composite
 * key) has no `one` mapping, `OrderItems` only serves reads (like a
 * read-only extension connector collection). `Todos.views` and
 * `Orders.total` are 64-bit integers (`Int64` / `UInt64` refs), and
 * `OrderItems.order` is required in the metadata but typed nullable, like
 * a relation into another data source.
 *
 * The fixture pairs with {@link createSchemaMetadataFixture} from
 * `./metadata`, which describes the same collections with primary indexes
 * (`Orders` composite, `OrderItems` non-`id`) and FK constraints.
 */
export function createOpenApiFixture(): any {
  return {
    'openapi': '3.1.0',
    'paths': {
      '/api/blog/items/Todos': collectionPath(['get', 'post', 'patch', 'delete']),
      '/api/blog/items/Todos/{key}': collectionPath(['get', 'patch', 'delete']),
      '/api/blog/items/Profiles': collectionPath(['get', 'post', 'patch', 'delete']),
      '/api/blog/items/Profiles/{key}': collectionPath(['get', 'patch', 'delete']),
      // Composite primary key: no `/{key}` item routes.
      '/api/blog/items/Orders': collectionPath(['get', 'post', 'patch', 'delete']),
      // Read-only extension connector collection: only declared operations.
      '/api/blog/items/OrderItems': collectionPath(['get']),
      '/api/blog/items/OrderItems/{key}': collectionPath(['get']),
    },
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
        one: {
          $ref: '#/paths/~1api~1blog~1items~1Profiles~1{key}',
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
        one: {
          $ref: '#/paths/~1api~1blog~1items~1OrderItems~1{key}',
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
            views: {
              $ref: '#/components/schemas/Int64',
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
            total: {
              oneOf: [
                { $ref: '#/components/schemas/UInt64' },
                { type: 'null' },
              ],
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
            // Required in the metadata, but typed nullable like a relation
            // into another data source.
            order: {
              oneOf: [
                { $ref: '#/components/schemas/OrdersCollectionOutput' },
                { type: 'null' },
              ],
            },
          },
        },
        // 64-bit integers are decimal strings in responses.
        Int64: {
          type: 'string',
          format: 'int64',
          pattern: '^-?[0-9]+$',
        },
        UInt64: {
          type: 'string',
          format: 'uint64',
          pattern: '^[0-9]+$',
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

/**
 * Creates an OpenAPI path item declaring the given HTTP methods.
 */
function collectionPath(methods: string[]): Record<string, unknown> {
  return Object.fromEntries(methods.map(method => [method, { responses: {} }]))
}
