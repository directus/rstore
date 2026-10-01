import { describe, expect, it } from 'vitest'
import {
  buildMonospaceCollections,
  generateConfigTemplate,
  generateItemsTemplate,
  generateTypedCollectionsTemplate,
  generateViteDeclarations,
  generateViteSchemaTemplate,
} from '../src/schema'
import { createSchemaMetadataFixture } from './utils/metadata'
import { createOpenApiFixture } from './utils/openapi'

describe('buildMonospaceCollections', () => {
  it('builds rstore collections from Monospace OpenAPI mappings and schema metadata', () => {
    const collections = buildMonospaceCollections({
      document: createOpenApiFixture(),
      metadata: createSchemaMetadataFixture(),
      scopeId: 'test-scope',
    })

    expect(collections.map(collection => collection.name)).toEqual(['Todos', 'Profiles', 'Orders', 'OrderItems'])
    expect(collections[0]).toMatchObject({
      name: 'Todos',
      scopeId: 'test-scope',
      meta: {
        monospace: {
          collection: 'Todos',
        },
        primaryKeys: ['id'],
      },
      getKeyExpression: 'item.id',
    })
  })

  it('resolves primary keys from the primary indexes in the schema metadata', () => {
    const collections = buildMonospaceCollections({
      document: createOpenApiFixture(),
      metadata: createSchemaMetadataFixture(),
      scopeId: 'test-scope',
    })
    const orders = collections.find(collection => collection.name === 'Orders')
    const orderItems = collections.find(collection => collection.name === 'OrderItems')

    // Composite primary key columns keep the primary index field order.
    expect(orders?.meta.primaryKeys).toEqual(['shop_id', 'code'])
    expect(orders?.getKeyExpression).toBe('item.shop_id + \'::\' + item.code')
    // Non-`id` primary keys come from the metadata, with no `id` fallback.
    expect(orderItems?.meta.primaryKeys).toEqual(['uuid'])
    expect(orderItems?.getKeyExpression).toBe('item.uuid')
  })

  it('supports explicit primary key overrides', () => {
    const collections = buildMonospaceCollections({
      document: createOpenApiFixture(),
      metadata: createSchemaMetadataFixture(),
      primaryKeys: {
        Todos: 'slug',
      },
      scopeId: 'test-scope',
    })

    expect(collections[0]?.meta.primaryKeys).toEqual(['slug'])
    expect(collections[0]?.getKeyExpression).toBe('item.slug')
  })

  it('fails when a collection has no primary index and no override', () => {
    const metadata = createSchemaMetadataFixture()
    metadata.MonospaceIndex = metadata.MonospaceIndex!.filter(index => index.id !== 'ix_todos_pk')

    expect(() => buildMonospaceCollections({
      document: createOpenApiFixture(),
      metadata,
      scopeId: 'test-scope',
    })).toThrow('Collection "Todos" has no primary index in the Monospace schema metadata')

    // An explicit override recovers the collection.
    const collections = buildMonospaceCollections({
      document: createOpenApiFixture(),
      metadata,
      primaryKeys: { Todos: 'id' },
      scopeId: 'test-scope',
    })
    expect(collections[0]?.meta.primaryKeys).toEqual(['id'])
  })

  it('fails when an exposed collection is missing from the schema metadata', () => {
    const metadata = createSchemaMetadataFixture()
    metadata.MonospaceCollection = metadata.MonospaceCollection.filter(collection => collection.apiName !== 'Orders')
    metadata.MonospaceSingleRelationField = metadata.MonospaceSingleRelationField!.filter((field) => {
      return field.collectionId !== 'c_orders' && field.oppositeCollectionId !== 'c_orders'
    })

    expect(() => buildMonospaceCollections({
      document: createOpenApiFixture(),
      metadata,
      scopeId: 'test-scope',
    })).toThrow('Collection "Orders" is missing from the Monospace schema metadata')
  })
})

describe('generated collection capabilities', () => {
  const collections = buildMonospaceCollections({
    document: createOpenApiFixture(),
    metadata: createSchemaMetadataFixture(),
    scopeId: 'test-scope',
  })
  const byName = new Map(collections.map(collection => [collection.name, collection]))

  it('flags collections without single-item routes', () => {
    // Composite primary key: no `one` mapping nor `/{key}` path.
    expect(byName.get('Orders')?.meta.monospace.itemRoutes).toBe(false)
    expect(byName.get('Todos')?.meta.monospace).not.toHaveProperty('itemRoutes')
  })

  it('reads the served operations from the mapped OpenAPI path methods', () => {
    // Read-only extension connector collections only serve reads.
    expect(byName.get('OrderItems')?.meta.monospace.operations).toEqual(['readMany', 'readOne'])
    expect(byName.get('Orders')?.meta.monospace.operations).toEqual(['readMany', 'create', 'updateMany', 'deleteMany'])
    // Fully featured collections keep a compact meta.
    expect(byName.get('Todos')?.meta.monospace).not.toHaveProperty('operations')
  })

  it('types 64-bit integers as decimal strings and records them in the meta', () => {
    const items = generateItemsTemplate(collections)

    expect(items).toContain('views?: string')
    expect(items).toContain('total?: string | null')
    expect(byName.get('Todos')?.meta.monospace.int64Fields).toEqual(['views'])
    expect(byName.get('Orders')?.meta.monospace.int64Fields).toEqual(['total'])
    expect(byName.get('Profiles')?.meta.monospace).not.toHaveProperty('int64Fields')
  })

  it('types required to-one relations nullable when the OpenAPI document does', () => {
    // `OrderItems.order` is required in the metadata, but Monospace types
    // relations into another data source as nullable.
    expect(generateItemsTemplate(collections)).toContain('order?: Orders | null')
  })
})

describe('template generation', () => {
  it('generates runtime schema JavaScript and TypeScript declarations', () => {
    const collections = buildMonospaceCollections({
      document: createOpenApiFixture(),
      metadata: createSchemaMetadataFixture(),
      scopeId: 'test-scope',
    })
    const items = generateItemsTemplate(collections)
    const schema = generateViteSchemaTemplate(collections)
    const declarations = generateViteDeclarations(collections)

    expect(items).toContain('export interface Todos')
    expect(items).toContain('id: number')
    expect(items).toContain('description?: string | null')
    // FK columns are plain generated item fields.
    expect(items).toContain('author_id?: string | null')
    expect(schema).toContain('export const schema')
    expect(schema).not.toContain('export interface')
    expect(declarations).toContain('declare module \'virtual:rstore-monospace/schema\'')
    expect(declarations).toContain('export interface Todos')
  })

  it('carries connect key metadata through generated templates', () => {
    const collections = buildMonospaceCollections({
      document: createOpenApiFixture(),
      metadata: createSchemaMetadataFixture(),
      scopeId: 'test-scope',
    })
    const schema = generateViteSchemaTemplate(collections)
    const typed = generateTypedCollectionsTemplate(collections)
    const declarations = generateViteDeclarations(collections)

    // Meta is JSON.stringify-ed into the runtime and typed collection
    // templates, so connect keys flow through automatically.
    expect(schema).toContain('"author":{"connectKeys":["email"],"forward":true}')
    expect(schema).toContain('"todos":{"connectKeys":["id"]}')
    expect(typed).toContain('"author":{"connectKeys":["email"],"forward":true}')
    // Declarations do not embed meta values; the meta type comes from the
    // CustomCollectionMeta augmentation and the declarations stay valid.
    expect(declarations).toContain('export const collection0: Collection<Todos>')
  })

  it('carries generated relations into typed templates', () => {
    const collections = buildMonospaceCollections({
      document: createOpenApiFixture(),
      metadata: createSchemaMetadataFixture(),
      scopeId: 'test-scope',
    })
    const items = generateItemsTemplate(collections)
    const typed = generateTypedCollectionsTemplate(collections)
    const declarations = generateViteDeclarations(collections)

    expect(items).toContain('author?: Profiles | null')
    expect(items).toContain('todos?: Todos[]')
    // Relations join on the real FK columns from the schema metadata.
    expect(typed).toContain('"author":{"to":{"Profiles":{"on":{"email":"author_id"}}}}')
    expect(typed).toContain('"todos":{"many":true,"to":{"Todos":{"on":{"author_id":"email"}}}}')
    expect(declarations).toContain('readonly relations: {"author":{"to":{"Profiles":{"on":{"email":"author_id"}}}}')
    expect(declarations).toContain('readonly relations: {"avatar"')
  })
})

describe('generateConfigTemplate', () => {
  it('exports the runtime client options', () => {
    const template = generateConfigTemplate({
      apiKey: 'runtime-token',
      cacheControl: 'no-cache',
      scopeId: 'test-scope',
      url: 'https://example.monospace.io',
      workspace: 'blog',
    })

    expect(template).toContain('export const apiKey = "runtime-token"')
    expect(template).toContain('export const cacheControl = "no-cache"')
  })
})
