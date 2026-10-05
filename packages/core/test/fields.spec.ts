import { createPlainDateTime } from '#test-utils/temporal'
import { describe, expect, it } from 'vitest'
import { diffFields } from '../src'

describe('diffFields', () => {
  it('should return changed fields', () => {
    const oldObj = { title: 'Old', description: 'Same', count: 1 }
    const newObj = { title: 'New', description: 'Same', count: 2 }

    const changed = diffFields(oldObj, newObj)

    expect(changed).toContain('title')
    expect(changed).toContain('count')
    expect(changed).not.toContain('description')
  })

  it('should detect added fields', () => {
    const oldObj = { a: 1 }
    const newObj = { a: 1, b: 2 }

    const changed = diffFields(oldObj, newObj)

    expect(changed).toContain('b')
    expect(changed).not.toContain('a')
  })

  it('should detect removed fields', () => {
    const oldObj = { a: 1, b: 2 }
    const newObj = { a: 1 }

    const changed = diffFields(oldObj, newObj)

    expect(changed).toContain('b')
  })

  it('should return empty array for identical objects', () => {
    const obj = { a: 1, b: 'hello' }
    const changed = diffFields(obj, { ...obj })

    expect(changed).toHaveLength(0)
  })

  it('should compare arrays by JSON equality', () => {
    const oldObj = { tags: ['a', 'b'] }
    const newObj = { tags: ['a', 'b'] }

    expect(diffFields(oldObj, newObj)).toHaveLength(0)

    const newObj2 = { tags: ['a', 'c'] }
    expect(diffFields(oldObj, newObj2)).toContain('tags')
  })

  it('should compare Temporal-like values by their public equality protocol', () => {
    const plainInitial = createPlainDateTime('2026-07-07T22:25')
    const plainChanged = createPlainDateTime('2026-07-07T22:30')

    expect(diffFields({ publishedAt: plainInitial }, { publishedAt: plainChanged })).toContain('publishedAt')
  })
})
