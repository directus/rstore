import { describe, expect, it } from 'vitest'
import { getSubscriptionId, normalizeSubscriptionKey } from '../src/runtime/utils/realtime'
import { subscriptionMatches } from '../src/runtime/utils/subscription-match'

describe('normalizeSubscriptionKey', () => {
  it('coerces numbers to strings', () => {
    expect(normalizeSubscriptionKey(42)).toBe('42')
  })

  it('leaves strings unchanged', () => {
    expect(normalizeSubscriptionKey('7::42')).toBe('7::42')
  })
})

describe('getSubscriptionId', () => {
  it('is stable across equivalent subscriptions', () => {
    const a = getSubscriptionId({ action: 'subscribe', collection: 'todos' })
    const b = getSubscriptionId({ action: 'unsubscribe', collection: 'todos' })
    // id deliberately ignores `action` — sub/unsub operate on the same topic.
    expect(a).toBe(b)
  })

  it('differs when the where clause differs', () => {
    const a = getSubscriptionId({
      action: 'subscribe',
      collection: 'todos',
      where: { operator: 'eq', field: 'done', value: true },
    })
    const b = getSubscriptionId({
      action: 'subscribe',
      collection: 'todos',
      where: { operator: 'eq', field: 'done', value: false },
    })
    expect(a).not.toBe(b)
  })

  it('collapses identical where clauses regardless of reference identity', () => {
    const where = { operator: 'eq' as const, field: 'done', value: true }
    const a = getSubscriptionId({ action: 'subscribe', collection: 'todos', where })
    const b = getSubscriptionId({ action: 'subscribe', collection: 'todos', where: { ...where } })
    expect(a).toBe(b)
  })
})

describe('subscriptionMatches', () => {
  it('rejects updates for other collections', () => {
    const matched = subscriptionMatches(
      { action: 'subscribe', collection: 'todos' },
      { collection: 'users', key: '1', record: { id: 1 } },
      'sqlite',
    )
    expect(matched).toBe(false)
  })

  it('matches wildcard-keyed subscriptions against any key', () => {
    const matched = subscriptionMatches(
      { action: 'subscribe', collection: 'todos' },
      { collection: 'todos', key: '42', record: { id: 42 } },
      'sqlite',
    )
    expect(matched).toBe(true)
  })

  it('honors key equality after string normalization', () => {
    // Subscription came in with a string key (post-normalize). Publisher
    // emits string keys too. Happy path.
    const matched = subscriptionMatches(
      { action: 'subscribe', collection: 'todos', key: '42' },
      { collection: 'todos', key: '42', record: { id: 42 } },
      'sqlite',
    )
    expect(matched).toBe(true)
  })

  it('rejects mismatched keys', () => {
    const matched = subscriptionMatches(
      { action: 'subscribe', collection: 'todos', key: '42' },
      { collection: 'todos', key: '43', record: { id: 43 } },
      'sqlite',
    )
    expect(matched).toBe(false)
  })

  it('would silently miss if a subscription key is not normalized to a string', () => {
    // Guardrail test: a raw number key here represents the pre-fix bug.
    // We assert the strict-equality mismatch so that regressions in the
    // server-side normalization surface immediately in the unit tests.
    const matched = subscriptionMatches(
      { action: 'subscribe', collection: 'todos', key: 42 },
      { collection: 'todos', key: '42', record: { id: 42 } },
      'sqlite',
    )
    expect(matched).toBe(false)
  })

  it('applies the where filter on the record', () => {
    const subscription = {
      action: 'subscribe' as const,
      collection: 'todos',
      where: { operator: 'eq' as const, field: 'done', value: true },
    }

    expect(subscriptionMatches(
      subscription,
      { collection: 'todos', key: '1', record: { id: 1, done: true } },
      'sqlite',
    )).toBe(true)

    expect(subscriptionMatches(
      subscription,
      { collection: 'todos', key: '1', record: { id: 1, done: false } },
      'sqlite',
    )).toBe(false)
  })

  it('matches created events (no key) when only a where filter is set', () => {
    const matched = subscriptionMatches(
      {
        action: 'subscribe',
        collection: 'todos',
        where: { operator: 'eq', field: 'done', value: false },
      },
      { collection: 'todos', record: { id: 99, done: false } },
      'sqlite',
    )
    expect(matched).toBe(true)
  })

  it('rejects created events for key-specific subscriptions', () => {
    // A subscription keyed on a specific id can't match a row whose key is
    // not yet known (new `created` frames carry no key). This protects the
    // client from receiving irrelevant rows.
    const matched = subscriptionMatches(
      { action: 'subscribe', collection: 'todos', key: '42' },
      { collection: 'todos', record: { id: 43 } },
      'sqlite',
    )
    expect(matched).toBe(false)
  })
})
