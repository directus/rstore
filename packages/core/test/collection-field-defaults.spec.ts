import type { ResolvedCollection } from '@rstore/shared'
import { mergeCollectionDefaultsFields, resolveCollections } from '@rstore/core'
import { describe, expect, it } from 'vitest'

describe('public field-default merging', () => {
  it('adds late defaults, preserves explicit field behavior, and isolates collection configs', () => {
    const collections: ResolvedCollection[] = resolveCollections([
      { name: 'custom', fields: { title: { parse: (value: unknown) => `custom:${value}` } } },
      { name: 'plain' },
    ])
    const defaults = { fields: { title: {
      parse: (value: unknown) => `default:${value}`,
      serialize: (value: unknown) => String(value).toUpperCase(),
    } } }
    mergeCollectionDefaultsFields(collections, defaults)
    const custom = collections[0]!.fields!.title!
    const plain = collections[1]!.fields!.title!
    expect(custom.parse!('one')).toBe('custom:one')
    expect(plain.parse!('one')).toBe('default:one')
    expect(custom.serialize!('one')).toBe('ONE')
    expect(plain.serialize!('one')).toBe('ONE')

    custom.serialize = () => 'custom serialization'
    expect(plain.serialize!('two')).toBe('TWO')
    expect(defaults.fields.title.serialize('two')).toBe('TWO')
    mergeCollectionDefaultsFields(collections, undefined)
    expect(custom.serialize('two')).toBe('custom serialization')
  })
})
