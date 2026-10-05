import type { DocOp, TransformOptions } from '../types.js'
import { OtTransformConflict } from '../errors.js'
import { transformOpPair } from './pairs.js'

/** Both lists of `transformDocOps`, each rebased over the other. */
export interface TransformedDocOps {
  /** `first`, rebased to apply after `later`. */
  first: DocOp[]
  /** `later`, rebased to apply after `first`. */
  later: DocOp[]
}

/**
 * Transforms two concurrent op lists authored on the same document, where
 * the server sequenced `first` before `later` (TP1: `first ∘ later'` and
 * `later ∘ first'` give the same document). Lists are folded pairwise; one
 * op may become several (or none) on either side.
 *
 * Throws `OtTransformConflict` when two ops cannot both be kept: the server
 * rejects the later transaction and its author rolls it back.
 */
export function transformDocOps(first: DocOp[], later: DocOp[], options?: TransformOptions): TransformedDocOps {
  // Loops over the lists; recursion only follows ops that expand into
  // several ops (a few levels), so long pending lists cannot overflow.
  let laterOps = later
  const firstOut: DocOp[] = []
  for (const op of first) {
    const [opPrime, laterPrime] = opVersusList(op, laterOps, options, 0)
    firstOut.push(...opPrime)
    laterOps = laterPrime
  }
  return { first: firstOut, later: laterOps }
}

/**
 * Expansion depth after which two ops are declared conflicting: pair rules
 * that each add an op (revive, hide) could otherwise feed each other.
 */
const MAX_EXPANSION_DEPTH = 32

/** One op sequenced first against a later list. */
function opVersusList(op: DocOp, later: DocOp[], options: TransformOptions | undefined, depth: number): [DocOp[], DocOp[]] {
  if (depth > MAX_EXPANSION_DEPTH) {
    throw new OtTransformConflict('transform does not settle')
  }
  let ops: DocOp[] = [op]
  const laterOut: DocOp[] = []
  for (const laterOp of later) {
    const [opsPrime, laterPrime] = listVersusOp(ops, laterOp, options, depth)
    ops = opsPrime
    laterOut.push(...laterPrime)
  }
  return [ops, laterOut]
}

/** A list sequenced first against one later op. */
function listVersusOp(first: DocOp[], later: DocOp, options: TransformOptions | undefined, depth: number): [DocOp[], DocOp[]] {
  let laterOps: DocOp[] = [later]
  const firstOut: DocOp[] = []
  for (const op of first) {
    const [opPrime, laterPrime] = laterOps.length === 1
      ? transformOpPair(op, laterOps[0]!, options)
      : opVersusList(op, laterOps, options, depth + 1)
    firstOut.push(...opPrime)
    laterOps = laterPrime
  }
  return [firstOut, laterOps]
}

/**
 * Rebases ops authored at some version over the ops sequenced since then
 * (in server order): the server-side half of `transformDocOps`.
 */
export function rebaseDocOps(ops: DocOp[], since: Iterable<DocOp[]>, options?: TransformOptions): DocOp[] {
  for (const sequenced of since) {
    ops = transformDocOps(sequenced, ops, options).later
  }
  return ops
}

/** Result of `rebaseDroppingConflicts`. */
export interface LenientRebase {
  /** The sequenced ops, rebased over the kept pending ops. */
  sequenced: DocOp[]
  /** Pending ops rebased over the sequenced ones. */
  pending: DocOp[]
  /** Pending ops dropped because they conflict with the sequenced ones. */
  dropped: DocOp[]
}

/**
 * Rebases unsent pending ops over sequenced ones, op by op, dropping each
 * pending op that conflicts instead of failing the whole list. Ops that
 * depended on a dropped one may no longer apply; callers apply them
 * leniently and let the server decide.
 */
export function rebaseDroppingConflicts(sequenced: DocOp[], pending: DocOp[], options?: TransformOptions): LenientRebase {
  const kept: DocOp[] = []
  const dropped: DocOp[] = []
  for (const op of pending) {
    try {
      const result = transformDocOps(sequenced, [op], options)
      kept.push(...result.later)
      sequenced = result.first
    }
    catch (error) {
      if (!(error instanceof OtTransformConflict)) {
        throw error
      }
      dropped.push(op)
    }
  }
  return { sequenced, pending: kept, dropped }
}
