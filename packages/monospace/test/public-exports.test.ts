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
    expect(monospace).toHaveProperty('applyMonospaceQuery')
    expect(monospace).toHaveProperty('evaluateMonospaceFilter')
    expect(monospace).toHaveProperty('createMonospaceIncludeFields')
    expect(monospace).toHaveProperty('applyMonospaceIncludeFields')
    expect(monospace).toHaveProperty('normalizeMonospaceRelationItems')
    expect(monospace).toHaveProperty('fetchMissingMonospaceRelations')
    expect(monospace).toHaveProperty('buildMonospaceRelationWrites')
    expect(monospace).toHaveProperty('applyMonospaceRelationCachePatches')
    expect(monospace).toHaveProperty('isMonospaceOperationPayload')
    expect(monospace).toHaveProperty('getMonospaceRelationConnectKeys')
  })

  it('exports schema helpers from the schema entry', () => {
    expect(schema).toHaveProperty('loadMonospaceCollections')
    expect(schema).toHaveProperty('loadRemoteSchemaMetadata')
    expect(schema).toHaveProperty('loadLocalSchemaMetadata')
    expect(schema).toHaveProperty('resolveMonospaceSchemaMetadata')
    expect(schema).toHaveProperty('buildMonospaceCollections')
    expect(schema).toHaveProperty('generateViteDeclarations')
    expect(schema).toHaveProperty('detectMonospaceRelationFields')
    expect(schema).toHaveProperty('mergeMonospaceRelationFieldMetadata')
    expect(schema).toHaveProperty('applyMonospaceRelations')
  })
})
