import type { RegisteredPlugin } from '@rstore/shared'
import { describe, expect, it, vi } from 'vitest'
import { sortPlugins } from '../src'

// `sortPlugins` is a pure topological sort over plain objects: no store, no
// cache, no hook dispatch. It stays a unit test. The runtime half of
// `plugin.ts` — which plugin's hook actually runs, and for which collection —
// lives in `packages/vue/test/integration/plugin-order.spec.ts`.

describe('plugin sorting', () => {
  it('should sort plugins based on order in the options', () => {
    const plugins: RegisteredPlugin[] = [
      {
        name: 'plugin-a',
        hooks: {},
        setup: vi.fn(),
      },
      {
        name: 'plugin-b',
        hooks: {},
        setup: vi.fn(),
      },
      {
        name: 'plugin-c',
        hooks: {},
        setup: vi.fn(),
      },
    ]

    const result = sortPlugins(plugins)

    expect(result.map(p => p.name)).toEqual(['plugin-a', 'plugin-b', 'plugin-c'])
  })

  it('should sort plugins based on after property', () => {
    const plugins: RegisteredPlugin[] = [
      {
        name: 'plugin-a',
        after: { plugins: ['plugin-b'] },
        hooks: {},
        setup: vi.fn(),
      },
      {
        name: 'plugin-b',
        hooks: {},
        setup: vi.fn(),
      },
      {
        name: 'plugin-c',
        after: { plugins: ['plugin-b'] },
        hooks: {},
        setup: vi.fn(),
      },
    ]

    const result = sortPlugins(plugins)

    expect(result.map(p => p.name)).toEqual(['plugin-b', 'plugin-a', 'plugin-c'])
  })

  it('should sort plugins based on before/after property', () => {
    const plugins: RegisteredPlugin[] = [
      {
        name: 'plugin-a',
        after: { plugins: ['plugin-b'] },
        hooks: {},
        setup: vi.fn(),
      },
      {
        name: 'plugin-b',
        hooks: {},
        setup: vi.fn(),
      },
      {
        name: 'plugin-c',
        after: { plugins: ['plugin-b'] },
        before: { plugins: ['plugin-a'] },
        hooks: {},
        setup: vi.fn(),
      },
    ]

    const result = sortPlugins(plugins)

    expect(result.map(p => p.name)).toEqual(['plugin-b', 'plugin-c', 'plugin-a'])
  })

  it.each([
    ['before', { before: { plugins: ['plugin-target', 'plugin-target', 'missing-plugin'] } }, ['plugin-source', 'plugin-target', 'plugin-other']],
    ['after', { after: { plugins: ['plugin-target', 'plugin-target', 'missing-plugin'] } }, ['plugin-target', 'plugin-source', 'plugin-other']],
  ] satisfies Array<[string, Partial<RegisteredPlugin>, string[]]>)('should ignore repeated and missing %s plugin constraints', (_constraint, options, expectedNames) => {
    const plugins: RegisteredPlugin[] = [
      {
        name: 'plugin-target',
        hooks: {},
        setup: vi.fn(),
      },
      {
        name: 'plugin-source',
        ...options,
        hooks: {},
        setup: vi.fn(),
      },
      {
        name: 'plugin-other',
        hooks: {},
        setup: vi.fn(),
      },
    ]

    const result = sortPlugins(plugins)

    expect(result.map(p => p.name)).toEqual(expectedNames)
    expect(new Set(result)).toHaveLength(plugins.length)
  })

  it('should sort plugins based on before property', () => {
    const plugins: RegisteredPlugin[] = [
      {
        name: 'plugin-a',
        hooks: {},
        setup: vi.fn(),
      },
      {
        name: 'plugin-b',
        hooks: {},
        setup: vi.fn(),
      },
      {
        name: 'plugin-c',
        before: { plugins: ['plugin-a'] },
        hooks: {},
        setup: vi.fn(),
      },
    ]

    const result = sortPlugins(plugins)

    expect(result.map(p => p.name)).toEqual(['plugin-c', 'plugin-a', 'plugin-b'])
  })

  it('should sort plugins based on before and after properties', () => {
    const plugins: RegisteredPlugin[] = [
      {
        name: 'plugin-a',
        after: { plugins: ['plugin-b'] },
        hooks: {},
        setup: vi.fn(),
      },
      {
        name: 'plugin-b',
        hooks: {},
        setup: vi.fn(),
      },
      {
        name: 'plugin-c',
        before: { plugins: ['plugin-a'] },
        hooks: {},
        setup: vi.fn(),
      },
    ]

    const result = sortPlugins(plugins)

    expect(result.map(p => p.name)).toEqual(['plugin-b', 'plugin-c', 'plugin-a'])
  })

  it('should handle circular dependencies gracefully', () => {
    const plugins: RegisteredPlugin[] = [
      {
        name: 'plugin-a',
        after: { plugins: ['plugin-b'] },
        hooks: {},
        setup: vi.fn(),
      },
      {
        name: 'plugin-b',
        after: { plugins: ['plugin-c'] },
        hooks: {},
        setup: vi.fn(),
      },
      {
        name: 'plugin-c',
        after: { plugins: ['plugin-a'] },
        hooks: {},
        setup: vi.fn(),
      },
    ]

    const result = sortPlugins(plugins)

    expect(result.map(p => p.name).sort()).toEqual(['plugin-a', 'plugin-b', 'plugin-c'])
  })

  it('should sort plugins based on category', () => {
    const plugins: RegisteredPlugin[] = [
      {
        name: 'plugin-a',
        category: 'remote',
        hooks: {},
        setup: vi.fn(),
      },
      {
        name: 'plugin-b',
        category: 'local',
        hooks: {},
        setup: vi.fn(),
      },
      {
        name: 'plugin-c',
        category: 'processing',
        hooks: {},
        setup: vi.fn(),
      },
      {
        name: 'plugin-d',
        hooks: {},
        setup: vi.fn(),
      },
    ]

    const result = sortPlugins(plugins)

    expect(result.map(p => p.name)).toEqual(['plugin-b', 'plugin-a', 'plugin-c', 'plugin-d'])
  })

  it('should sort plugins based on category and before/after properties', () => {
    const plugins: RegisteredPlugin[] = [
      {
        name: 'plugin-a',
        category: 'remote',
        after: { plugins: ['plugin-b'] },
        hooks: {},
        setup: vi.fn(),
      },
      {
        name: 'plugin-b',
        category: 'local',
        hooks: {},
        setup: vi.fn(),
      },
      {
        name: 'plugin-c',
        category: 'processing',
        before: { plugins: ['plugin-a'] },
        hooks: {},
        setup: vi.fn(),
      },
      {
        name: 'plugin-d',
        hooks: {},
        setup: vi.fn(),
      },
    ]

    const result = sortPlugins(plugins)

    expect(result.map(p => p.name)).toEqual(['plugin-b', 'plugin-c', 'plugin-a', 'plugin-d'])
  })

  it('should sort based on before/after categories', () => {
    const plugins: RegisteredPlugin[] = [
      {
        name: 'plugin-a',
        after: { categories: ['local'] },
        hooks: {},
        setup: vi.fn(),
      },
      {
        name: 'plugin-b',
        category: 'local',
        hooks: {},
        setup: vi.fn(),
      },
      {
        name: 'plugin-c',
        hooks: {},
        setup: vi.fn(),
      },
      {
        name: 'plugin-d',
        category: 'remote',
        hooks: {},
        setup: vi.fn(),
      },
      {
        name: 'plugin-e',
        category: 'processing',
        before: { categories: ['remote'] },
        hooks: {},
        setup: vi.fn(),
      },
    ]

    const result = sortPlugins(plugins)

    expect(result.map(p => p.name)).toEqual(['plugin-b', 'plugin-a', 'plugin-c', 'plugin-e', 'plugin-d'])
  })
})
