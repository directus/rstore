import { describe, expect, it } from 'vitest'
import {
  createMonospaceError,
  MonospaceLicenseError,
  MonospaceRestError,
  MonospaceValidationError,
} from '../src'

describe('createMonospaceError', () => {
  it('surfaces the innermost source message and code behind generic messages', () => {
    const source = {
      message: 'Output validation failed',
      source: {
        message: 'Operation not supported',
        code: '4010',
        source: { message: 'Collection does not declare deleteOne' },
      },
    }
    const error = createMonospaceError(422, {
      message: 'Failed to execute query',
      code: '4000',
      source,
      meta: { path: [] },
    })

    expect(error).toBeInstanceOf(MonospaceValidationError)
    expect(error.message).toBe('Failed to execute query: Collection does not declare deleteOne')
    // The deepest code wins over the generic top-level code.
    expect(error.code).toBe('4010')
    expect(error.source).toBe(source)
    expect(error.meta).toEqual({ path: [] })
  })

  it('keeps the top-level message and code without a source chain', () => {
    const error = createMonospaceError(400, { message: 'Invalid input', code: '4001' })

    expect(error.message).toBe('Invalid input')
    expect(error.code).toBe('4001')
  })

  it('maps license limit errors with their violations', () => {
    const violations = [{ entitlement: 'seats', usage: 4, hard_limit: 3 }]
    const error = createMonospaceError(402, {
      message: 'The requested operation would exceed licensed hard limits',
      code: '6004',
      meta: { violations },
    })

    expect(error).toBeInstanceOf(MonospaceLicenseError)
    expect(error.status).toBe(402)
    expect(error.code).toBe('6004')
    expect((error as MonospaceLicenseError).violations).toEqual(violations)
  })

  it('maps locked licenses without code nor violations', () => {
    const error = createMonospaceError(402, { message: 'System is locked. Please contact system administrator.' })

    expect(error).toBeInstanceOf(MonospaceLicenseError)
    expect(error).toBeInstanceOf(MonospaceRestError)
    expect((error as MonospaceLicenseError).violations).toEqual([])
  })
})
