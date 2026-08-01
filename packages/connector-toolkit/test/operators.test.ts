import { describe, expect, it } from 'vitest'
import { comparableValue, evaluateOperator, supported } from '../src'

/**
 * Shortcut asserting a supported match result.
 */
function expectMatch(itemValue: any, operator: string, value: any, matches: boolean): void {
  expect(evaluateOperator(itemValue, operator, value)).toEqual({ supported: true, matches })
}

describe('evaluateOperator', () => {
  it('evaluates equality operators with loose semantics', () => {
    expectMatch('1', '_eq', 1, true)
    expectMatch(1, '_eq', 2, false)
    expectMatch(1, '_neq', '1', false)
    expectMatch(null, '_eq', undefined, true)
  })

  it('evaluates comparison operators with date coercion', () => {
    expectMatch(2, '_lt', 3, true)
    expectMatch(3, '_lte', 3, true)
    expectMatch(4, '_gt', 3, true)
    expectMatch(3, '_gte', 4, false)
    expectMatch('2024-01-02', '_gt', '2024-01-01', true)
    expectMatch(new Date('2024-01-01'), '_lt', '2024-01-02', true)
  })

  it('evaluates list operators', () => {
    expectMatch(2, '_in', [1, 2], true)
    expectMatch(2, '_in', [3], false)
    expectMatch(2, '_nin', [3], true)
    expectMatch(2, '_in', 'not-an-array', false)
  })

  it('validates the _null boolean operand', () => {
    expectMatch(null, '_null', true, true)
    expectMatch('x', '_null', true, false)
    expectMatch('x', '_null', false, true)
    expect(evaluateOperator(null, '_null', 'yes')).toEqual({
      supported: false,
      reason: '_null expects a boolean value',
    })
  })

  it('evaluates text operators', () => {
    expectMatch('Hello World', '_contains', 'World', true)
    expectMatch('Hello World', '_icontains', 'world', true)
    expectMatch('Hello World', '_ncontains', 'World', false)
    expectMatch('Hello World', '_nicontains', 'world', false)
    expectMatch('Hello', '_starts_with', 'He', true)
    expectMatch('Hello', '_nstarts_with', 'He', false)
    expectMatch('Hello', '_ends_with', 'lo', true)
    expectMatch('Hello', '_nends_with', 'lo', false)
    expectMatch(42, '_contains', '4', false)
  })

  it('evaluates range operators', () => {
    expectMatch(5, '_between', [1, 10], true)
    expectMatch(11, '_between', [1, 10], false)
    expectMatch(11, '_nbetween', [1, 10], true)
    expectMatch(5, '_between', [1], false)
  })

  it('reports unknown operators as unsupported', () => {
    expect(evaluateOperator(1, '_regex', '\\d')).toEqual({
      supported: false,
      reason: 'Filter operator not supported: _regex',
    })
  })

  it('tries extra operators before the core switch', () => {
    const extra = (itemValue: any, operator: string): ReturnType<typeof supported> | undefined => {
      if (operator === '_eq') {
        return supported(itemValue === 'override')
      }
      if (operator === '_custom') {
        return supported(true)
      }
      return undefined
    }

    // Extra overrides a core operator.
    expect(evaluateOperator('override', '_eq', 'anything', { extra })).toEqual({ supported: true, matches: true })
    // Extra handles an operator unknown to the core switch.
    expect(evaluateOperator('x', '_custom', 'y', { extra })).toEqual({ supported: true, matches: true })
    // `undefined` falls through to the core switch.
    expect(evaluateOperator(3, '_lt', 4, { extra })).toEqual({ supported: true, matches: true })
    // Fallthrough still reports unknown operators.
    expect(evaluateOperator(3, '_nope', 4, { extra })).toEqual({
      supported: false,
      reason: 'Filter operator not supported: _nope',
    })
  })
})

describe('comparableValue', () => {
  it('converts dates and ISO strings to timestamps', () => {
    expect(comparableValue(new Date('2024-01-01T00:00:00Z'))).toBe(Date.parse('2024-01-01T00:00:00Z'))
    expect(comparableValue('2024-01-01')).toBe(Date.parse('2024-01-01'))
  })

  it('leaves non-date values untouched', () => {
    expect(comparableValue('hello')).toBe('hello')
    expect(comparableValue(42)).toBe(42)
    // Numeric strings are not dates.
    expect(comparableValue('42')).toBe('42')
  })
})
