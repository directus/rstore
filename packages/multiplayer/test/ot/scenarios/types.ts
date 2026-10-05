import type { DocOp, DocState } from '@rstore/multiplayer/ot'
import type { NodeSpec } from '../harness/docs'

/**
 * One E3 intention-preservation scenario: concurrent edits authored on the
 * same document, the order in which the server receives them, and the
 * expected visible document (written before the implementation).
 */
export interface Scenario {
  name: string
  doc: NodeSpec[]
  /** Concurrent edits per client, each authored on the initial document. */
  edits: Record<string, (state: DocState) => DocOp[]>
  /** Server arrival orders to run; every order must give `expected`. */
  orders: string[][]
  /** `outline()` of the converged document. */
  expected: string[]
  /** A sequential follow-up edit once converged. */
  then?: { client: string, edit: (state: DocState) => DocOp[], expected: string[] }
}

/** Both arrival orders of two clients A and B. */
export const BOTH_ORDERS = [['A', 'B'], ['B', 'A']]
