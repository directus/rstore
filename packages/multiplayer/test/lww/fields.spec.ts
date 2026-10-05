import { createFieldTimestamps, mergeItemFields, touchFields } from '@rstore/multiplayer/lww'
import { describe, expect, it } from 'vitest'

describe('mergeItemFields', () => {
  it('should keep local values when local timestamps are newer', () => {
    const local = { title: 'Local Title', description: 'Local Desc' }
    const remote = { title: 'Remote Title', description: 'Remote Desc' }
    const localTs = { title: 200, description: 200 }
    const remoteTs = { title: 100, description: 100 }

    const result = mergeItemFields(local, remote, localTs, remoteTs)

    expect(result.merged.title).toBe('Local Title')
    expect(result.merged.description).toBe('Local Desc')
    expect(result.conflicts).toHaveLength(0)
  })

  it('should accept remote values when remote timestamps are newer', () => {
    const local = { title: 'Local Title', description: 'Local Desc' }
    const remote = { title: 'Remote Title', description: 'Remote Desc' }
    const localTs = { title: 100, description: 100 }
    const remoteTs = { title: 200, description: 200 }

    const result = mergeItemFields(local, remote, localTs, remoteTs)

    expect(result.merged.title).toBe('Remote Title')
    expect(result.merged.description).toBe('Remote Desc')
    expect(result.conflicts).toHaveLength(0)
  })

  it('should merge field-by-field when timestamps differ per field', () => {
    const local = { title: 'Local Title', description: 'Local Desc', status: 'draft' }
    const remote = { title: 'Remote Title', description: 'Remote Desc', status: 'published' }
    const localTs = { title: 200, description: 100, status: 100 }
    const remoteTs = { title: 100, description: 200, status: 200 }

    const result = mergeItemFields(local, remote, localTs, remoteTs)

    expect(result.merged.title).toBe('Local Title')
    expect(result.merged.description).toBe('Remote Desc')
    expect(result.merged.status).toBe('published')
    expect(result.conflicts).toHaveLength(0)
  })

  it('should detect conflicts when timestamps are equal but values differ', () => {
    const local = { title: 'Local Title', description: 'Same Desc' }
    const remote = { title: 'Remote Title', description: 'Same Desc' }
    const localTs = { title: 100, description: 100 }
    const remoteTs = { title: 100, description: 100 }

    const result = mergeItemFields(local, remote, localTs, remoteTs)

    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]!.field).toBe('title')
    expect(result.conflicts[0]!.localValue).toBe('Local Title')
    expect(result.conflicts[0]!.remoteValue).toBe('Remote Title')
    // Local value is kept by default
    expect(result.merged.title).toBe('Local Title')
    // No conflict on description since values are equal
    expect(result.merged.description).toBe('Same Desc')
  })

  it('should not report conflict when timestamps are equal and values are the same', () => {
    const local = { title: 'Same', count: 42 }
    const remote = { title: 'Same', count: 42 }
    const localTs = { title: 100, count: 100 }
    const remoteTs = { title: 100, count: 100 }

    const result = mergeItemFields(local, remote, localTs, remoteTs)

    expect(result.conflicts).toHaveLength(0)
    expect(result.merged.title).toBe('Same')
    expect(result.merged.count).toBe(42)
  })

  it('should handle fields present only in local', () => {
    const local: Record<string, any> = { title: 'Title', extra: 'local-only' }
    const remote: Record<string, any> = { title: 'Title' }
    const localTs = { title: 100, extra: 100 }
    const remoteTs = { title: 100 }

    const result = mergeItemFields(local, remote, localTs, remoteTs)

    expect(result.merged.extra).toBe('local-only')
    expect(result.mergedTimestamps.extra).toBe(100)
  })

  it('should erase a local field the remote omits but still stamps as newer', () => {
    const local: Record<string, any> = { title: 'Title', email: 'leia@example.com' }
    const remote: Record<string, any> = { title: 'Title' }
    const localTs = { title: 100, email: 100 }
    const remoteTs = { title: 100, email: 200 }

    const result = mergeItemFields(local, remote, localTs, remoteTs)

    // A newer stamp for an absent field wins, so the merge reads `undefined`
    // off the remote. This is why a server narrowing a realtime frame's record
    // MUST narrow its `fieldTimestamps` to match — see `buildPeerFrame` in
    // `@rstore/nuxt-drizzle`. Dropping the stamp alongside the field is what
    // keeps the branch above ("present only in local") applicable instead.
    expect(result.merged.email).toBeUndefined()

    const narrowedTs = { title: 100 }
    expect(mergeItemFields(local, remote, localTs, narrowedTs).merged.email).toBe('leia@example.com')
  })

  it('should handle fields present only in remote', () => {
    const local: Record<string, any> = { title: 'Title' }
    const remote: Record<string, any> = { title: 'Title', newField: 'remote-only' }
    const localTs = { title: 100 }
    const remoteTs = { title: 100, newField: 200 }

    const result = mergeItemFields(local, remote, localTs, remoteTs)

    expect(result.merged.newField).toBe('remote-only')
    expect(result.mergedTimestamps.newField).toBe(200)
  })

  it('should handle missing timestamps (defaulting to 0)', () => {
    const local = { title: 'Local', description: 'Local' }
    const remote = { title: 'Remote', description: 'Remote' }
    const localTs = {} // no timestamps
    const remoteTs = { title: 100, description: 100 }

    const result = mergeItemFields(local, remote, localTs, remoteTs)

    // Remote wins since local timestamps default to 0
    expect(result.merged.title).toBe('Remote')
    expect(result.merged.description).toBe('Remote')
  })

  it('should store the correct merged timestamps', () => {
    const local = { a: 1, b: 2 }
    const remote = { a: 10, b: 20 }
    const localTs = { a: 300, b: 100 }
    const remoteTs = { a: 200, b: 400 }

    const result = mergeItemFields(local, remote, localTs, remoteTs)

    expect(result.mergedTimestamps.a).toBe(300) // local won
    expect(result.mergedTimestamps.b).toBe(400) // remote won
  })
})

describe('createFieldTimestamps', () => {
  it('should create timestamps for all fields', () => {
    const data = { title: 'Test', count: 5, active: true }
    const now = Date.now()
    const ts = createFieldTimestamps(data, now)

    expect(ts.title).toBe(now)
    expect(ts.count).toBe(now)
    expect(ts.active).toBe(now)
  })

  it('should default to a fresh HLC timestamp string', () => {
    const ts = createFieldTimestamps({ x: 1 })
    expect(typeof ts.x).toBe('string')
    // HLC string form: "{physicalHex}:{logicalHex}:{nodeId}" — two colons.
    const colons = (ts.x as string).split(':').length - 1
    expect(colons).toBeGreaterThanOrEqual(2)
  })

  it('should return empty object for empty input', () => {
    const ts = createFieldTimestamps({})
    expect(Object.keys(ts)).toHaveLength(0)
  })
})

describe('touchFields', () => {
  it('should update specified fields', () => {
    const ts = { a: 100, b: 100, c: 100 }
    const result = touchFields(ts, ['a', 'c'], 200)

    expect(result.a).toBe(200)
    expect(result.b).toBe(100)
    expect(result.c).toBe(200)
  })

  it('should not mutate the original timestamps', () => {
    const ts = { a: 100 }
    const result = touchFields(ts, ['a'], 200)

    expect(ts.a).toBe(100)
    expect(result.a).toBe(200)
  })

  it('should add new fields', () => {
    const ts = { a: 100 }
    const result = touchFields(ts, ['b'], 200)

    expect(result.a).toBe(100)
    expect(result.b).toBe(200)
  })
})
