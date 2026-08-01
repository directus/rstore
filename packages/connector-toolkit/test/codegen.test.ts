import type { CodegenCollection, RenderedItemField, VirtualModuleNames } from '../src'
import { describe, expect, it } from 'vitest'
import {
  collectionTypeName,
  createGetKeyExpression,
  generateCollectionsTemplate,
  generateItemsTemplate,
  generateTypedCollectionsTemplate,
  generateViteDeclarations,
  generateViteIndexTemplate,
  generateViteSchemaTemplate,
  indent,
  itemAccessExpression,
  tsPropertyName,
} from '../src'

interface FixtureCollection extends CodegenCollection {
  itemFields: RenderedItemField[]
}

const collections: FixtureCollection[] = [
  {
    name: 'posts',
    scopeId: 'test-scope',
    meta: { primaryKeys: ['id'] },
    relations: { author: { to: { users: { on: { id: 'author_id' } } } } },
    getKeyExpression: 'item.id',
    typeName: 'Posts',
    itemFields: [
      { name: 'id', type: 'number' },
      { name: 'title', type: 'string', optional: true },
      { name: 'kebab-field', type: 'string | null' },
    ],
  },
  {
    name: 'users',
    scopeId: 'test-scope',
    meta: { primaryKeys: ['id'], singleton: false },
    relations: {},
    getKeyExpression: 'item.id',
    typeName: 'Users',
    itemFields: [
      { name: 'id', type: 'number' },
      { name: 'email', type: 'string' },
    ],
  },
]

const names: VirtualModuleNames = {
  virtualId: 'virtual:rstore-directus',
  clientBinding: 'directus',
  pluginBinding: 'directusPlugin',
  packageName: '@rstore/directus',
  clientTypeName: 'DirectusRstoreClient',
  pluginFactoryName: 'createDirectusRstorePlugin',
}

/**
 * Monospace-style field accessor: pre-rendered fields with optional flags.
 */
const getFields = (collection: FixtureCollection): RenderedItemField[] => collection.itemFields

describe('codegen templates', () => {
  it('generates runtime collection modules', () => {
    expect(generateCollectionsTemplate(collections)).toMatchSnapshot()
  })

  it('generates item interfaces with optional flags and quoted names', () => {
    const source = generateItemsTemplate(collections, getFields)

    expect(source).toContain('export interface Posts {')
    expect(source).toContain('  title?: string')
    expect(source).toContain('  "kebab-field": string | null')
    expect(source).toMatchSnapshot()
  })

  it('generates item interfaces from mapped required-only fields', () => {
    // Directus-style accessor: no optional flags at all.
    const source = generateItemsTemplate(collections, collection => collection.itemFields.map(field => ({
      name: field.name,
      type: field.type,
    })))

    expect(source).toContain('  title: string')
    expect(source).not.toContain('?')
  })

  it('generates typed collection modules', () => {
    const source = generateTypedCollectionsTemplate(collections, {
      itemsImport: '#build/$rstore-directus-items',
    })

    expect(source).toContain('from "#build/$rstore-directus-items"')
    expect(source).toContain('withItemType<Posts>().defineCollection({')
    expect(source).toMatchSnapshot()
  })

  it('escapes the items import specifier', () => {
    const source = generateTypedCollectionsTemplate(collections, {
      itemsImport: 'weird\'"specifier',
    })

    expect(source).toContain(`from ${JSON.stringify('weird\'"specifier')}`)
  })

  it('returns an empty typed module without collections', () => {
    expect(generateTypedCollectionsTemplate([], { itemsImport: 'x' })).toBe('export {}\n')
  })

  it('generates the vite schema module', () => {
    const source = generateViteSchemaTemplate(collections)

    expect(source).toContain('export const schema = [\n  collection0,\n  collection1\n]')
    expect(source).toMatchSnapshot()
  })

  it('generates the vite index module', () => {
    expect(generateViteIndexTemplate(names)).toBe(`export { schema } from 'virtual:rstore-directus/schema'
export { directus, directusPlugin } from 'virtual:rstore-directus/plugin'
`)
  })

  it('generates vite declarations without the relations line', () => {
    const source = generateViteDeclarations(collections, names, { getFields })

    expect(source).toContain('declare module \'virtual:rstore-directus/schema\'')
    expect(source).toContain('export const directus: DirectusRstoreClient')
    expect(source).toContain('ReturnType<typeof createDirectusRstorePlugin>')
    expect(source).not.toContain('readonly relations:')
    expect(source).toMatchSnapshot()
  })

  it('generates vite declarations with the relations line', () => {
    const source = generateViteDeclarations(collections, names, {
      getFields,
      includeRelationsLine: true,
    })

    expect(source).toContain('readonly relations: {"author":{"to":{"users":{"on":{"id":"author_id"}}}}}')
  })

  it('declares a generic schema without collections', () => {
    expect(generateViteDeclarations([], names, { getFields: () => [] })).toContain('export const schema: StoreSchema')
  })
})

describe('identifiers', () => {
  it('quotes non-identifier property names', () => {
    expect(tsPropertyName('title')).toBe('title')
    expect(tsPropertyName('$id')).toBe('$id')
    expect(tsPropertyName('kebab-field')).toBe('"kebab-field"')
  })

  it('creates safe item access expressions', () => {
    expect(itemAccessExpression('id')).toBe('item.id')
    expect(itemAccessExpression('kebab-field')).toBe('item["kebab-field"]')
  })

  it('creates getKey expressions', () => {
    expect(createGetKeyExpression(['id'])).toBe('item.id')
    expect(createGetKeyExpression(['tenant', 'post-id'])).toBe('item.tenant + \'::\' + item["post-id"]')
    expect(createGetKeyExpression([], { singleton: true })).toBe('\'singleton\'')
    expect(createGetKeyExpression([])).toBe('item.id')
  })

  it('creates collection type names with a fallback prefix', () => {
    expect(collectionTypeName('blog-posts', 'Directus')).toBe('BlogPosts')
    // Underscores are identifier characters and survive pascal-casing.
    expect(collectionTypeName('blog_posts', 'Directus')).toBe('Blog_posts')
    expect(collectionTypeName('123', 'Directus')).toBe('Directus123')
    expect(collectionTypeName('', 'Monospace')).toBe('MonospaceItem')
  })

  it('indents source lines but not empty lines', () => {
    expect(indent('a\n\nb', 2)).toBe('  a\n\n  b')
  })
})
