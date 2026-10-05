import type { Delta, DeltaAttributes, TextOp } from '@rstore/multiplayer/ot'
import process from 'node:process'
import { normalizeDelta, normalizeTextOp } from '@rstore/multiplayer/ot'
import fc from 'fast-check'

/**
 * fast-check runs per property. E2 asks for 100 000; the unit suite keeps a
 * smaller default and `RSTORE_OT_PROPERTY_RUNS=100000` reproduces the gate.
 */
export const propertyRuns = Number(process.env.RSTORE_OT_PROPERTY_RUNS ?? 300)

/** Characters used in generated text: ASCII, a BMP letter and astral emoji (surrogate pairs). */
const CHARS = ['a', 'b', 'c', ' ', 'é', '😀', '👍🏽']

/** Mark keys: expandable (`bold`, `italic`), non-expandable (`link`) and a comment anchor. */
const markValue = fc.oneof(
  fc.record({ bold: fc.constant(true) }),
  fc.record({ italic: fc.constant(true) }),
  fc.record({ link: fc.constantFrom('https://a', 'https://b') }),
  fc.record({ 'comment:1': fc.constant(true) }),
  fc.record({ bold: fc.constant(true), link: fc.constant('https://a') }),
)

/** Optional marks for inserted content. */
export const insertAttributesArb: fc.Arbitrary<DeltaAttributes | undefined> = fc.option(markValue, { nil: undefined })

/** Marks for format components; `null` removes a mark. */
const formatAttributesArb: fc.Arbitrary<Record<string, unknown>> = fc.oneof(
  markValue,
  fc.record({ bold: fc.constant(null) }),
  fc.record({ link: fc.constant(null), italic: fc.constant(true) }),
)

/** Text made of whole code points, so it never contains a lone surrogate. */
export const textArb = fc.array(fc.constantFrom(...CHARS), { minLength: 1, maxLength: 4 }).map(chars => chars.join(''))

/** One insert: text or an embed. */
const insertArb = fc.oneof(
  { weight: 5, arbitrary: textArb },
  { weight: 1, arbitrary: fc.constantFrom<Record<string, unknown>>({ hardBreak: true }, { mention: { id: 'u1' } }) },
)

/** Random textblock content. */
export const deltaArb: fc.Arbitrary<Delta> = fc.array(
  fc.record({ insert: insertArb, attributes: insertAttributesArb }),
  { maxLength: 6 },
).map(runs => normalizeDelta(runs.map(run => run.attributes ? run : { insert: run.insert })))

/** Abstract step a text op is built from, interpreted against concrete content. */
export interface TextStep {
  kind: 'retain' | 'format' | 'delete' | 'insert'
  size: number
  insert: string | Record<string, unknown>
  insertAttributes: DeltaAttributes | undefined
  formatAttributes: Record<string, unknown>
}

/** Random abstract step. */
const stepArb: fc.Arbitrary<TextStep> = fc.record({
  kind: fc.constantFrom<TextStep['kind']>('retain', 'format', 'delete', 'insert', 'insert'),
  size: fc.integer({ min: 1, max: 4 }),
  insert: insertArb,
  insertAttributes: insertAttributesArb,
  formatAttributes: formatAttributesArb,
})

/**
 * Units of `content` as code-point aligned cells: an astral character is one
 * cell of length 2, an embed one cell of length 1.
 */
function cellLengths(content: Delta): number[] {
  const cells: number[] = []
  for (const run of content) {
    if (typeof run.insert !== 'string') {
      cells.push(1)
      continue
    }
    for (const char of run.insert) {
      cells.push(char.length)
    }
  }
  return cells
}

/**
 * Builds a valid op on `content` from abstract steps: retains, formats and
 * deletes consume whole code points, so no component splits a surrogate pair.
 */
export function buildTextOp(content: Delta, steps: TextStep[]): TextOp {
  const cells = cellLengths(content)
  let cell = 0
  const op: TextOp = []
  const take = (count: number) => {
    let units = 0
    const end = Math.min(cells.length, cell + count)
    for (; cell < end; cell++) {
      units += cells[cell]!
    }
    return units
  }
  for (const step of steps) {
    if (step.kind === 'insert') {
      op.push(step.insertAttributes ? { insert: step.insert, attributes: step.insertAttributes } : { insert: step.insert })
      continue
    }
    const units = take(step.size)
    if (units === 0) {
      continue
    }
    if (step.kind === 'delete') {
      op.push({ delete: units })
    }
    else if (step.kind === 'format') {
      op.push({ retain: units, attributes: step.formatAttributes })
    }
    else {
      op.push({ retain: units })
    }
  }
  return normalizeTextOp(op)
}

/** A random valid op on `content`. */
export function textOpArb(content: Delta): fc.Arbitrary<TextOp> {
  return fc.array(stepArb, { maxLength: 6 }).map(steps => buildTextOp(content, steps))
}

/** Content plus two concurrent ops on it. */
export const concurrentTextOpsArb = deltaArb.chain(content => fc.tuple(fc.constant(content), textOpArb(content), textOpArb(content)))
