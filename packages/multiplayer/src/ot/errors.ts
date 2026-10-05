/**
 * An operation does not apply to the document: shape, bounds, surrogate
 * pairs, unknown or duplicate nodes, or a move that creates a cycle. The
 * sequencer rejects the transaction with reason `invalid` (`cycle` for moves).
 */
export class OtValidationError extends Error {
  /** Machine-readable reason, used as the `collab:reject` reason. */
  readonly reason: 'invalid' | 'cycle'

  constructor(message: string, reason: 'invalid' | 'cycle' = 'invalid') {
    super(`[rstore ot] ${message}`)
    this.name = 'OtValidationError'
    this.reason = reason
  }
}

/**
 * Two concurrent operations cannot both be kept (for example the same node
 * merged into two different targets). The later sequenced transaction is
 * rejected with reason `conflict`; its author rolls it back.
 */
export class OtTransformConflict extends Error {
  constructor(message: string) {
    super(`[rstore ot] ${message}`)
    this.name = 'OtTransformConflict'
  }
}
