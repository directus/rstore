import type { DirectusCollection, DirectusField, DirectusRelation } from '@directus/sdk'
import { describe, expect, it } from 'vitest'
import { buildDirectusCollections, directusFieldToTsType } from '../src/introspection'

function collection(name: string, options: {
  hidden?: boolean
  singleton?: boolean
  schema?: object | null
} = {}): DirectusCollection {
  return {
    collection: name,
    meta: {
      hidden: options.hidden ?? false,
      singleton: options.singleton ?? false,
    },
    schema: options.schema === undefined ? { name } : options.schema,
  } as DirectusCollection
}

function field(collection: string, name: string, options: {
  type?: string
  alias?: boolean
  nullable?: boolean
  primary?: boolean
} = {}): DirectusField {
  return {
    collection,
    field: name,
    type: options.alias ? 'alias' : options.type ?? 'string',
    schema: options.alias
      ? null
      : {
          is_nullable: options.nullable ?? false,
          is_primary_key: options.primary ?? false,
        },
  } as unknown as DirectusField
}

describe('directusFieldToTsType', () => {
  it('maps Directus scalar fields to TypeScript types', () => {
    expect(directusFieldToTsType(field('posts', 'id', { type: 'uuid' }))).toBe('string')
    expect(directusFieldToTsType(field('posts', 'count', { type: 'integer' }))).toBe('number')
    expect(directusFieldToTsType(field('posts', 'enabled', { type: 'boolean' }))).toBe('boolean')
    expect(directusFieldToTsType(field('posts', 'meta', { type: 'json' }))).toBe('any')
    expect(directusFieldToTsType(field('posts', 'date', { type: 'dateTime', nullable: true }))).toBe('string | null')
  })
})

describe('buildDirectusCollections', () => {
  it('filters hidden/system collections and includes singletons', () => {
    const result = buildDirectusCollections({
      collections: [
        collection('Todos'),
        collection('Settings', { singleton: true }),
        collection('Hidden', { hidden: true }),
        collection('directus_users'),
        collection('NoSchema', { schema: null }),
      ],
      fields: new Map([
        ['Todos', [field('Todos', 'id', { primary: true })]],
        ['Settings', [field('Settings', 'title')]],
      ]),
      relations: [],
      scopeId: 'scope',
    })

    expect(result.map(item => item.name)).toEqual(['Todos', 'Settings'])
    expect(result[0]?.meta.primaryKeys).toEqual(['id'])
    expect(result[1]?.meta.directus.singleton).toBe(true)
    expect(result[1]?.getKeyExpression).toBe('\'singleton\'')
  })

  it('generates only safe alias-side relations', () => {
    const relations = [{
      collection: 'Posts',
      field: 'author',
      related_collection: 'Users',
      meta: {
        one_field: 'posts',
      },
      schema: {
        foreign_key_column: 'id',
      },
    }] as unknown as DirectusRelation[]

    const result = buildDirectusCollections({
      collections: [
        collection('Users'),
        collection('Posts'),
      ],
      fields: new Map([
        ['Users', [
          field('Users', 'id', { type: 'uuid', primary: true }),
          field('Users', 'posts', { alias: true }),
        ]],
        ['Posts', [
          field('Posts', 'id', { type: 'uuid', primary: true }),
          field('Posts', 'author', { type: 'uuid' }),
        ]],
      ]),
      relations,
      scopeId: 'scope',
    })

    expect(result.find(item => item.name === 'Users')?.relations).toEqual({
      posts: {
        many: true,
        to: {
          Posts: {
            on: {
              author: 'id',
            },
          },
        },
      },
    })
    expect(result.find(item => item.name === 'Posts')?.relations).toEqual({})
  })
})
