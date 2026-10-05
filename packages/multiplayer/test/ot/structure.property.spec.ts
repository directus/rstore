import type { DocOp, DocState } from '@rstore/multiplayer/ot'
import type { DocOpType } from './harness/randomOps'
import { applyDocOps, cloneDocState, invertDocOps, OtTransformConflict, OtValidationError, transformDocOps } from '@rstore/multiplayer/ot'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { records } from './harness/docs'
import { fcRandom } from './harness/random'
import { DOC_OP_TYPES, randomDoc, randomDocOp } from './harness/randomOps'
import { propertyRuns } from './harness/textArbitraries'

/** Applies ops on a copy; returns the state or the validation error. */
function tryApply(state: DocState, ops: DocOp[]): DocState | OtValidationError {
  const copy = cloneDocState(state)
  try {
    applyDocOps(copy, ops)
    return copy
  }
  catch (error) {
    if (error instanceof OtValidationError) {
      return error
    }
    throw error
  }
}

/** Ordered op type pairs: every structure/text combination (E2 is per pair). */
const pairs = DOC_OP_TYPES.flatMap(first => DOC_OP_TYPES.map(later => [first, later] as [DocOpType, DocOpType]))

describe('structure OT properties', () => {
  it.each(pairs)('tP1 holds for %s sequenced before %s', (firstType, laterType) => {
    fc.assert(fc.property(fc.gen(), (g) => {
      const random = fcRandom(g, fc)
      const state = randomDoc(random)
      const first = randomDocOp(random, state, firstType, 'a-')
      const later = randomDocOp(random, state, laterType, 'b-')
      fc.pre(first !== null && later !== null)
      // Both ops are valid on the shared base, as the authoring clients saw it.
      const afterFirst = tryApply(state, [first!])
      const afterLater = tryApply(state, [later!])
      fc.pre(!(afterFirst instanceof OtValidationError) && !(afterLater instanceof OtValidationError))

      let transformed: { first: DocOp[], later: DocOp[] }
      try {
        transformed = transformDocOps([first!], [later!])
      }
      catch (error) {
        // A conflict rejects the later transaction on the server; its author
        // detects the same conflict and rolls back. Nothing to compare.
        expect(error).toBeInstanceOf(OtTransformConflict)
        return
      }
      const serverPath = tryApply(afterFirst as DocState, transformed.later)
      const clientPath = tryApply(afterLater as DocState, transformed.first)
      const context = JSON.stringify({ first, later, transformed, server: String(serverPath instanceof Error ? serverPath : ''), client: String(clientPath instanceof Error ? clientPath : '') })
      // Validity is symmetric: when the server rejects the later op (cycle),
      // its author also fails to apply the first op over its own.
      expect(serverPath instanceof OtValidationError, context).toBe(clientPath instanceof OtValidationError)
      if (!(serverPath instanceof OtValidationError)) {
        expect(records(clientPath as DocState), context).toEqual(records(serverPath))
      }
    }), { numRuns: propertyRuns })
  })

  it.each(DOC_OP_TYPES)('inverting %s restores every existing node and hides new ones', (type) => {
    fc.assert(fc.property(fc.gen(), (g) => {
      const random = fcRandom(g, fc)
      const state = randomDoc(random)
      const op = randomDocOp(random, state, type, 'a-')
      fc.pre(op !== null)
      const changed = tryApply(state, [op!])
      fc.pre(!(changed instanceof OtValidationError))
      const inverse = invertDocOps(state, [op!])
      const restored = tryApply(changed as DocState, inverse)
      expect(restored).not.toBeInstanceOf(OtValidationError)
      const after = (restored as DocState).nodes
      for (const node of state.nodes.values()) {
        expect(after.get(node.id)).toEqual(node)
      }
      for (const node of after.values()) {
        if (!state.nodes.has(node.id)) {
          expect(node.deleted).toBe(true)
        }
      }
    }), { numRuns: propertyRuns })
  })
})
