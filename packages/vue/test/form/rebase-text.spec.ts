import { createFormObject } from '@rstore/vue'
import { describe, expect, it } from 'vitest'

describe('form CRDT rebase and conflicts', () => {
  it('should merge non-overlapping concurrent text edits on the same field', () => {
    const form = createFormObject({
      defaultValues: () => ({ body: 'Hello world' }),
      submit: async () => {},
    })

    form.body = 'Hello brave world'
    form.$rebase({ body: 'Hello world!' })

    expect(form.body).toBe('Hello brave world!')
    expect(form.$conflicts).toHaveLength(0)
    expect(form.$changedProps.body).toEqual(['Hello brave world!', 'Hello world!'])
    expect(form.$opLog.getFieldOps('body')).toEqual([
      expect.objectContaining({
        field: 'body',
        type: 'set',
        oldValue: 'Hello world!',
        newValue: 'Hello brave world!',
      }),
    ])
  })

  it('should preserve text undo history when rebasing concurrent remote updates', () => {
    const form = createFormObject({
      defaultValues: () => ({ body: 'Hello world' }),
      submit: async () => {},
    })

    form.body = 'Hello brave world'
    form.body = 'Hello brave new world'

    form.$rebase({ body: 'Hello world!' })

    expect(form.body).toBe('Hello brave new world!')
    expect(form.$opLog.getFieldOps('body')).toEqual([
      expect.objectContaining({
        field: 'body',
        type: 'set',
        oldValue: 'Hello world!',
        newValue: 'Hello brave world!',
      }),
      expect.objectContaining({
        field: 'body',
        type: 'set',
        oldValue: 'Hello brave world!',
        newValue: 'Hello brave new world!',
      }),
    ])

    expect(form.$opLog.undo()).toBe(true)
    expect(form.body).toBe('Hello brave world!')

    expect(form.$opLog.undo()).toBe(true)
    expect(form.body).toBe('Hello world!')
  })

  it('should keep conflicts for overlapping text edits on the same field', () => {
    const form = createFormObject({
      defaultValues: () => ({ body: 'Hello world' }),
      submit: async () => {},
    })

    form.body = 'Hello planet'
    form.$rebase({ body: 'Hello there' })

    expect(form.body).toBe('Hello planet')
    expect(form.$conflicts).toHaveLength(1)
    expect(form.$conflicts[0]).toMatchObject({
      field: 'body',
      localValue: 'Hello planet',
      remoteValue: 'Hello there',
    })
  })
})
