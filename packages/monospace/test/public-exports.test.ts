import { describe, expect, it } from 'vitest'
import * as monospace from '../src'
import * as schema from '../src/schema'

describe('public exports', () => {
  it('exports runtime helpers from the main entry', () => {
    expect(monospace).toHaveProperty('createMonospaceRestClient')
    expect(monospace).toHaveProperty('createMonospaceRstorePlugin')
    expect(monospace).toHaveProperty('createMonospaceQuery')
    expect(monospace).toHaveProperty('stripPrimaryKeys')
    expect(monospace).toHaveProperty('DEFAULT_MONOSPACE_SCOPE_ID')
  })

  it('exports schema helpers from the schema entry', () => {
    expect(schema).toHaveProperty('loadMonospaceCollections')
    expect(schema).toHaveProperty('buildMonospaceCollections')
    expect(schema).toHaveProperty('generateViteDeclarations')
  })
})
