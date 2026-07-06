import { describe, expect, it } from 'vitest'
import { buildMonospaceCollections } from '../src/schema'
import { createSchemaMetadataFixture } from './utils/metadata'
import { createOpenApiFixture } from './utils/openapi'

/**
 * Builds the fixture collections with optional fixture overrides.
 */
function buildFixtureCollections(options: {
  document?: any
  metadata?: any
  primaryKeys?: Record<string, string | string[]>
} = {}) {
  return buildMonospaceCollections({
    document: options.document ?? createOpenApiFixture(),
    metadata: options.metadata ?? createSchemaMetadataFixture(),
    primaryKeys: options.primaryKeys,
    scopeId: 'test-scope',
  })
}

describe('monospace relation generation', () => {
  it('generates a forward to-one relation joined on the real FK column', () => {
    const todos = buildFixtureCollections().find(collection => collection.name === 'Todos')

    // The constraint joins `Todos.author_id` to the non-PK `Profiles.email`.
    expect(todos?.relations.author).toEqual({
      to: {
        Profiles: {
          on: {
            email: 'author_id',
          },
        },
      },
    })
  })

  it('generates a to-one relation from a bare schema reference', () => {
    const profiles = buildFixtureCollections().find(collection => collection.name === 'Profiles')

    expect(profiles?.relations.avatar).toEqual({
      to: {
        Todos: {
          on: {
            id: 'avatar_id',
          },
        },
      },
    })
  })

  it('generates a backward to-many relation joined on the target FK columns', () => {
    const profiles = buildFixtureCollections().find(collection => collection.name === 'Profiles')

    expect(profiles?.relations.todos).toEqual({
      many: true,
      to: {
        Todos: {
          on: {
            author_id: 'email',
          },
        },
      },
    })
  })

  it('generates composite FK join mappings with ordered constraint columns', () => {
    const collections = buildFixtureCollections()
    const orders = collections.find(collection => collection.name === 'Orders')
    const orderItems = collections.find(collection => collection.name === 'OrderItems')

    expect(orderItems?.relations.order).toEqual({
      to: {
        Orders: {
          on: {
            shop_id: 'order_shop_id',
            code: 'order_code',
          },
        },
      },
    })
    expect(orders?.relations.items).toEqual({
      many: true,
      to: {
        OrderItems: {
          on: {
            order_shop_id: 'shop_id',
            order_code: 'code',
          },
        },
      },
    })
  })

  it('ignores references to schemas that are not exposed collections', () => {
    const todos = buildFixtureCollections().find(collection => collection.name === 'Todos')

    expect(todos?.relations.attachment).toBeUndefined()
  })

  it('ignores metadata relations that are not exposed in the OpenAPI document', () => {
    const todos = buildFixtureCollections().find(collection => collection.name === 'Todos')

    // The backward side of Profiles.avatar exists in the metadata only.
    expect(todos?.relations.avatarOf).toBeUndefined()
    expect(todos?.itemFields.find(field => field.name === 'avatarOf')).toBeUndefined()
  })

  it('keeps join mappings on constraint columns regardless of primary key overrides', () => {
    const collections = buildFixtureCollections({
      primaryKeys: {
        Profiles: 'name',
      },
    })
    const todos = collections.find(collection => collection.name === 'Todos')
    const profiles = collections.find(collection => collection.name === 'Profiles')

    // Overriding primary keys only affects getKey, not the FK join columns.
    expect(profiles?.meta.primaryKeys).toEqual(['name'])
    expect(todos?.relations.author).toEqual({
      to: {
        Profiles: {
          on: {
            email: 'author_id',
          },
        },
      },
    })
  })

  it('fails when an OpenAPI relation field is missing from the schema metadata', () => {
    const metadata = createSchemaMetadataFixture()
    metadata.MonospaceSingleRelationField = metadata.MonospaceSingleRelationField!.filter((field) => {
      return field.id !== 'rf_todos_author' && field.id !== 'rf_profiles_todos'
    })

    expect(() => buildFixtureCollections({ metadata })).toThrow(
      'Relation field "Todos.author" is missing from the Monospace schema metadata',
    )
  })

  it('fails when the OpenAPI and metadata targets disagree', () => {
    const metadata = createSchemaMetadataFixture()
    const author = metadata.MonospaceSingleRelationField!.find(field => field.id === 'rf_todos_author')!
    author.oppositeCollectionId = 'c_orders'

    expect(() => buildFixtureCollections({ metadata })).toThrow(
      'Relation field "Todos.author" targets "Profiles" in the OpenAPI document but "Orders" in the schema metadata',
    )
  })

  it('extracts connect key columns into collection meta', () => {
    const collections = buildFixtureCollections()
    const todos = collections.find(collection => collection.name === 'Todos')
    const profiles = collections.find(collection => collection.name === 'Profiles')
    const orders = collections.find(collection => collection.name === 'Orders')
    const orderItems = collections.find(collection => collection.name === 'OrderItems')

    // Forward relations use the constraint referenced columns.
    expect(todos?.meta.monospace.relations?.author).toEqual({ connectKeys: ['email'] })
    expect(orderItems?.meta.monospace.relations?.order).toEqual({ connectKeys: ['shop_id', 'code'] })
    // Forward relations without an OpenAPI connect input schema still get
    // connect keys from the constraint.
    expect(profiles?.meta.monospace.relations?.avatar).toEqual({ connectKeys: ['id'] })
    // Backward relations keep the OpenAPI connect keys input columns.
    expect(profiles?.meta.monospace.relations?.todos).toEqual({ connectKeys: ['id'] })
    expect(orders?.meta.monospace.relations?.items).toEqual({ connectKeys: ['uuid'] })
  })

  it('prefers constraint columns over disagreeing OpenAPI connect key inputs', () => {
    const document = createOpenApiFixture()
    // Simulate a stale connect input schema listing the wrong column.
    document.components.schemas.TodosauthorConnectForwardKeyInput = {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    }

    const todos = buildFixtureCollections({ document }).find(collection => collection.name === 'Todos')

    expect(todos?.meta.monospace.relations?.author).toEqual({ connectKeys: ['email'] })
  })

  it('types relation item fields with generated interface names', () => {
    const collections = buildFixtureCollections()
    const todos = collections.find(collection => collection.name === 'Todos')
    const profiles = collections.find(collection => collection.name === 'Profiles')

    expect(todos?.itemFields.find(field => field.name === 'author')).toEqual({
      name: 'author',
      optional: true,
      type: 'Profiles | null',
    })
    expect(profiles?.itemFields.find(field => field.name === 'avatar')).toEqual({
      name: 'avatar',
      optional: true,
      type: 'Todos',
    })
    expect(profiles?.itemFields.find(field => field.name === 'todos')).toEqual({
      name: 'todos',
      optional: true,
      type: 'Todos[]',
    })
    expect(todos?.itemFields.find(field => field.name === 'attachment')).toEqual({
      name: 'attachment',
      optional: true,
      type: 'any',
    })
    // FK columns stay plain typed fields.
    expect(todos?.itemFields.find(field => field.name === 'author_id')).toEqual({
      name: 'author_id',
      optional: true,
      type: 'string | null',
    })
  })
})
