import { describe, expect, it } from 'vitest'
import * as directus from '../src'
import * as schema from '../src/schema'

describe('public exports', () => {
  it('exports runtime helpers from the main entry', () => {
    expect(directus).toHaveProperty('createDirectusClient')
    expect(directus).toHaveProperty('createDirectusRstorePlugin')
    expect(directus).toHaveProperty('createDirectusQuery')
    expect(directus).toHaveProperty('stripPrimaryKeys')
    expect(directus).toHaveProperty('applyDirectusQuery')
    expect(directus).toHaveProperty('evaluateDirectusFilter')
  })

  it('exports schema helpers from the schema entry', () => {
    expect(schema).toHaveProperty('loadDirectusCollections')
    expect(schema).toHaveProperty('buildDirectusCollections')
    expect(schema).toHaveProperty('generateViteDeclarations')
  })
})
