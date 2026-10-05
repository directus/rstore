import * as clock from '@rstore/multiplayer/clock'
import * as lww from '@rstore/multiplayer/lww'
import * as text from '@rstore/multiplayer/text'
import { fieldValuesEqual as sharedFieldValuesEqual } from '@rstore/shared'
import { describe, expect, it } from 'vitest'
import * as core from '../src'

/**
 * Names `@rstore/core` keeps exporting for one minor (0.9.x) although they
 * moved to `@rstore/multiplayer`. Deleted in 0.10 with `src/deprecated/`.
 */
const deprecatedReExports = {
  clock: [
    'DEFAULT_MAX_CLOCK_SKEW_MS',
    'HLCClockSkewError',
    'HybridLogicalClock',
    'compareHLC',
    'createHLCClock',
    'getDefaultClock',
    'parseHLC',
    'setDefaultClock',
    'stringifyHLC',
  ],
  lww: [
    'createFieldTimestamps',
    'createTombstoneStore',
    'gcTombstones',
    'isTombstone',
    'mergeItemFields',
    'scheduleTombstoneGc',
    'shouldResurrect',
    'tombstoneKey',
    'touchFields',
  ],
  text: [
    'applyTextChanges',
    'diffText',
    'mergeText',
    'rebaseTextPosition',
    'rebaseTextRange',
  ],
}

const sources: Record<keyof typeof deprecatedReExports, Record<string, unknown>> = { clock, lww, text }

const cases = Object.entries(deprecatedReExports).flatMap(([entry, names]) =>
  names.map(name => [name, entry as keyof typeof deprecatedReExports] as const))

describe('public core exports', () => {
  it.each(cases)('re-exports %s as the same object as @rstore/multiplayer/%s', (name, entry) => {
    expect(sources[entry][name]).toBeDefined()
    expect((core as Record<string, unknown>)[name]).toBe(sources[entry][name])
  })

  it('keeps the generic field utilities in core', () => {
    expect(core.fieldValuesEqual).toBe(sharedFieldValuesEqual)
    expect(core.diffFields({ a: 1, b: [1] }, { a: 1, b: [2] })).toEqual(['b'])
  })
})
