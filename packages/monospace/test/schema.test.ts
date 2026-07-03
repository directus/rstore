import { describe, expect, it } from 'vitest'
import {
  buildMonospaceCollections,
  generateItemsTemplate,
  generateViteDeclarations,
  generateViteSchemaTemplate,
} from '../src/schema'
import { createOpenApiFixture } from './utils/openapi'

describe('buildMonospaceCollections', () => {
  it('builds rstore collections from Monospace OpenAPI mappings', () => {
    const collections = buildMonospaceCollections({
      document: createOpenApiFixture(),
      scopeId: 'test-scope',
    })

    expect(collections.map(collection => collection.name)).toEqual(['Todos', 'Profiles'])
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

  it('supports explicit primary key overrides', () => {
    const collections = buildMonospaceCollections({
      document: createOpenApiFixture(),
      primaryKeys: {
        Todos: 'slug',
      },
      scopeId: 'test-scope',
    })

    expect(collections[0]?.meta.primaryKeys).toEqual(['slug'])
    expect(collections[0]?.getKeyExpression).toBe('item.slug')
  })
})

describe('template generation', () => {
  it('generates runtime schema JavaScript and TypeScript declarations', () => {
    const collections = buildMonospaceCollections({
      document: createOpenApiFixture(),
      scopeId: 'test-scope',
    })
    const items = generateItemsTemplate(collections)
    const schema = generateViteSchemaTemplate(collections)
    const declarations = generateViteDeclarations(collections)

    expect(items).toContain('export interface Todos')
    expect(items).toContain('id: number')
    expect(items).toContain('description?: string | null')
    expect(schema).toContain('export const schema')
    expect(schema).not.toContain('export interface')
    expect(declarations).toContain('declare module \'virtual:rstore-monospace/schema\'')
    expect(declarations).toContain('export interface Todos')
  })
})
