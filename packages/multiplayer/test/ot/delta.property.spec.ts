import { applyTextOp, composeTextOps, deltaLength, invertTextOp, transformTextOp, transformTextPosition } from '@rstore/multiplayer/ot'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { concurrentTextOpsArb, deltaArb, propertyRuns, textOpArb } from './harness/textArbitraries'

/** E2 text properties: TP1, inverse, compose and position monotonicity. */
describe('text OT properties', () => {
  it('converges with TP1 whichever op the server sequenced first', () => {
    fc.assert(fc.property(concurrentTextOpsArb, ([content, first, later]) => {
      const serverPath = applyTextOp(applyTextOp(content, first), transformTextOp(later, first, false))
      const clientPath = applyTextOp(applyTextOp(content, later), transformTextOp(first, later, true))
      expect(clientPath).toEqual(serverPath)
    }), { numRuns: propertyRuns })
  })

  it('restores the content when the inverse is applied', () => {
    fc.assert(fc.property(deltaArb.chain(content => fc.tuple(fc.constant(content), textOpArb(content))), ([content, op]) => {
      const inverse = invertTextOp(op, content)
      expect(applyTextOp(applyTextOp(content, op), inverse)).toEqual(applyTextOp(content, []))
    }), { numRuns: propertyRuns })
  })

  it('composes like applying both ops in order', () => {
    const arb = deltaArb.chain(content => textOpArb(content).chain(first =>
      textOpArb(applyTextOp(content, first)).map(second => [content, first, second] as const)))
    fc.assert(fc.property(arb, ([content, first, second]) => {
      expect(applyTextOp(content, composeTextOps(first, second)))
        .toEqual(applyTextOp(applyTextOp(content, first), second))
    }), { numRuns: propertyRuns })
  })

  it('maps positions monotonically', () => {
    const arb = deltaArb.chain(content => fc.tuple(
      textOpArb(content),
      fc.nat({ max: 40 }),
      fc.nat({ max: 40 }),
      fc.constantFrom<'left' | 'right'>('left', 'right'),
    ))
    fc.assert(fc.property(arb, ([op, a, b, affinity]) => {
      const [low, high] = a <= b ? [a, b] : [b, a]
      expect(transformTextPosition(op, low, affinity)).toBeLessThanOrEqual(transformTextPosition(op, high, affinity))
    }), { numRuns: propertyRuns })
  })

  it('maps the end of the content to the end of the result', () => {
    fc.assert(fc.property(concurrentTextOpsArb, ([content, op]) => {
      expect(transformTextPosition(op, deltaLength(content), 'right')).toBe(deltaLength(applyTextOp(content, op)))
    }), { numRuns: propertyRuns })
  })
})
