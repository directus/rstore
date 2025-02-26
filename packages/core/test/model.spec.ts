import type { Model, ModelDefaults } from '@rstore/shared'
import { describe, expect, it } from 'vitest'
import { defaultGetKey, resolveModel } from '../src/model'

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

describe('model', () => {
  it('should resolve model with defaults', () => {
    const modelTypes: Model = {
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
      getKey: (item: any) => item.id,
      meta: {
        test: 'meow',
      },
    }
    const resolved = resolveModel(modelTypes, defaults)
    expect(resolved.TestModel.getKey).toBe(defaults.getKey)
    expect(resolved.TestModel.meta).toEqual({
      path: '/test',
      test: 'meow',
    })
    expect(resolved.Test2.getKey).toBe(modelTypes.Test2.getKey)
    expect(resolved.Test2.meta).toEqual({
      test: 'meow',
    })
  })

  it('should resolve all model props', () => {
    const modelTypes: Model = {
      TestModel: {
        name: 'TestModel',
        getKey: (item: any) => item.id,
        relations: [
          {
            name: 'test',
            model: 'Test2',
            type: 'one',
            field: 'testId',
            reference: 'id',
          },
        ],
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

    const resolved = resolveModel(modelTypes)

    expect(resolved.TestModel.getKey).toBe(modelTypes.TestModel.getKey)
    expect(resolved.TestModel.relations).toEqual([
      {
        name: 'test',
        model: 'Test2',
        type: 'one',
        field: 'testId',
        reference: 'id',
      },
    ])
    expect(resolved.TestModel.computed.calc).toBeTypeOf('function')
    expect(resolved.TestModel.fields!.createdAt.parse).toBeTypeOf('function')
    expect(resolved.TestModel.schema.create['~standard'].vendor).toBe('rstore')
    expect(resolved.TestModel.schema.update['~standard'].vendor).toBe('rstore')
    expect(resolved.TestModel.meta).toEqual({
      test: 'meow',
    })
  })

  it('should resolve all default props', () => {
    const modelTypes: Model = {
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

    const resolved = resolveModel(modelTypes, defaults)

    expect(resolved.TestModel.getKey).toBe(defaults.getKey)
    expect(resolved.TestModel.relations).toEqual([])
    expect(resolved.TestModel.computed.calc).toBeTypeOf('function')
    expect(resolved.TestModel.fields!.createdAt.parse).toBeTypeOf('function')
    expect(resolved.TestModel.schema.create['~standard'].vendor).toBe('rstore')
    expect(resolved.TestModel.schema.update['~standard'].vendor).toBe('rstore')
    expect(resolved.TestModel.meta).toEqual({
      test: 'meow',
    })
  })
})
