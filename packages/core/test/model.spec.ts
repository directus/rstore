import type { Model, ModelDefaults, ModelMap } from '@rstore/shared'
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
    const modelTypes: ModelMap = {
      TestModel: {
        name: 'TestModel',
        meta: {
          path: '/test',
        },
      },
      Test2: {
        name: 'Test2',
        getKey: (item: any) => item.id,
      },
    }
    const defaults: ModelDefaults = {
      getKey: (item: any) => `${item.id}$default`,
      meta: {
        test: 'meow',
      },
    }
    const resolved = resolveModels(modelTypes, defaults)
    expect(resolved.TestModel.getKey({ id: 'foo' })).toBe(defaults.getKey?.({ id: 'foo' }))
    expect(resolved.TestModel.meta).toEqual({
      path: '/test',
      test: 'meow',
    })
    expect(resolved.Test2.getKey({ id: 'foo' })).toBe(modelTypes.Test2.getKey?.({ id: 'foo' }))
    expect(resolved.Test2.meta).toEqual({
      test: 'meow',
    })
  })

  it('should resolve all model props', () => {
    const modelTypes: ModelMap = {
      TestModel: {
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
        schema: {
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
    }

    const resolved = resolveModels(modelTypes)

    expect(resolved.TestModel.getKey({ id: 'foo' })).toBe(modelTypes.TestModel.getKey?.({ id: 'foo' }))
    expect(resolved.TestModel.relations).toEqual({
      test: {
        to: {
          Test2: {
            on: 'testId',
            eq: 'id',
          },
        },
      },
    })
    expect(resolved.TestModel.computed.calc).toBeTypeOf('function')
    expect(resolved.TestModel.fields!.createdAt.parse).toBeTypeOf('function')
    expect(resolved.TestModel.schema.create['~standard'].vendor).toBe('rstore')
    expect(resolved.TestModel.schema.update['~standard'].vendor).toBe('rstore')
    expect(resolved.TestModel.meta).toEqual({
      test: 'meow',
    })
  })

  it('should resolve all default props', () => {
    const modelTypes: ModelMap = {
      TestModel: {
        name: 'TestModel',
      },
    }

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

    expect(resolved.TestModel.getKey({ id: 0 })).toBe(defaults.getKey?.({ id: 0 }))
    expect(resolved.TestModel.relations).toEqual({})
    expect(resolved.TestModel.computed.calc).toBeTypeOf('function')
    expect(resolved.TestModel.fields!.createdAt.parse).toBeTypeOf('function')
    expect(resolved.TestModel.schema.create['~standard'].vendor).toBe('rstore')
    expect(resolved.TestModel.schema.update['~standard'].vendor).toBe('rstore')
    expect(resolved.TestModel.meta).toEqual({
      test: 'meow',
    })
  })
})
