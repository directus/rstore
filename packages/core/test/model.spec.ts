import type { Model, ModelDefaults, ModelList } from '@rstore/shared'
import { describe, expect, it } from 'vitest'
import { defaultGetKey, defaultIsInstanceOf, resolveModels } from '../src/model'

describe('default get key', () => {
  it('should return id if present', () => {
    const item = { id: 123, __id: 456 }
    expect(defaultGetKey(item)).toBe(123)
  })

  it('should return __id if id is not present', () => {
    const item = { __id: 456 }
    expect(defaultGetKey(item)).toBe(456)
  })

  it('should return undefined if neither id nor __id is present', () => {
    const item = { name: 'test' }
    expect(defaultGetKey(item)).toBeUndefined()
  })
})

describe('default isInstanceOf', () => {
  it('should return true if item __typename matches model name', () => {
    const model = { name: 'TestModel' } as Model
    const item = { __typename: 'TestModel' }
    expect(defaultIsInstanceOf(model)(item)).toBe(true)
  })

  it('should return false if item __typename does not match model name', () => {
    const model = { name: 'TestModel' } as Model
    const item = { __typename: 'AnotherModel' }
    expect(defaultIsInstanceOf(model)(item)).toBe(false)
  })

  it('should return false if item does not have __typename', () => {
    const model = { name: 'TestModel' } as Model
    const item = { id: 123 }
    expect(defaultIsInstanceOf(model)(item)).toBe(false)
  })
})

describe('model', () => {
  it('should resolve model with defaults', () => {
    const modelTypes: ModelList = [
      {
        name: 'TestModel',
        meta: {
          path: '/test',
        },
      },
      {
        name: 'Test2',
        getKey: (item: any) => item.id,
      },
    ]
    const defaults: ModelDefaults = {
      getKey: (item: any) => `${item.id}$default`,
      meta: {
        test: 'meow',
      },
    }
    const resolved = resolveModels(modelTypes, defaults)
    expect(resolved[0].getKey({ id: 'foo' })).toBe(defaults.getKey?.({ id: 'foo' }))
    expect(resolved[0].meta).toEqual({
      path: '/test',
      test: 'meow',
    })
    expect(resolved[1].getKey({ id: 'foo' })).toBe(modelTypes[1].getKey?.({ id: 'foo' }))
    expect(resolved[1].meta).toEqual({
      test: 'meow',
    })
  })

  it('should resolve all model props', () => {
    const modelTypes: ModelList = [
      {
        name: 'TestModel',
        getKey: (item: any) => item.id,
        relations: {
          test: {
            to: {
              Test2: {
                on: 'testId',
                eq: 'id',
              },
            },
          },
        },
        computed: {
          calc: item => item.id + 1,
        },
        fields: {
          createdAt: {
            parse: value => new Date(value),
          },
        },
        formSchema: {
          create: {
            '~standard': {
              validate: value => ({ value }),
              vendor: 'rstore',
              version: 1,
            },
          },
          update: {
            '~standard': {
              validate: value => ({ value }),
              vendor: 'rstore',
              version: 1,
            },
          },
        },
        meta: {
          test: 'meow',
        },
      },
    ]

    const resolved = resolveModels(modelTypes)

    expect(resolved[0].getKey({ id: 'foo' })).toBe(modelTypes[0].getKey?.({ id: 'foo' }))
    expect(resolved[0].relations).toEqual({
      test: {
        to: {
          Test2: {
            on: 'testId',
            eq: 'id',
          },
        },
      },
    })
    expect(resolved[0].computed.calc).toBeTypeOf('function')
    expect(resolved[0].fields!.createdAt.parse).toBeTypeOf('function')
    expect(resolved[0].formSchema.create['~standard'].vendor).toBe('rstore')
    expect(resolved[0].formSchema.update['~standard'].vendor).toBe('rstore')
    expect(resolved[0].meta).toEqual({
      test: 'meow',
    })
  })

  it('should resolve all default props', () => {
    const modelTypes: ModelList = [
      {
        name: 'TestModel',
      },
    ]

    const defaults: ModelDefaults = {
      getKey: (item: any) => item.id,
      computed: {
        calc: item => item.id + 1,
      },
      fields: {
        createdAt: {
          parse: value => new Date(value),
        },
      },
      meta: {
        test: 'meow',
      },
    }

    const resolved = resolveModels(modelTypes, defaults)

    expect(resolved[0].getKey({ id: 0 })).toBe(defaults.getKey?.({ id: 0 }))
    expect(resolved[0].relations).toEqual({})
    expect(resolved[0].computed.calc).toBeTypeOf('function')
    expect(resolved[0].fields!.createdAt.parse).toBeTypeOf('function')
    expect(resolved[0].formSchema.create['~standard'].vendor).toBe('rstore')
    expect(resolved[0].formSchema.update['~standard'].vendor).toBe('rstore')
    expect(resolved[0].meta).toEqual({
      test: 'meow',
    })
  })
})
