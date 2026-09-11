/** Query ownership metadata exposed by one wrapped item. */
export interface WrappedItemMetadata<
  _TCollection = unknown,
  _TCollectionDefaults = unknown,
  _TSchema = unknown,
> {
  /** Queries currently owning the item. */
  queries: Set<any>
  /** Owning queries that need reconciliation. */
  dirtyQueries: Set<any>
}

const queriesKey = Symbol('queries')
const dirtyQueriesKey = Symbol('dirtyQueries')

/** Prototype-backed metadata that allocates ownership sets on demand. */
class LazyWrappedItemMetadata implements WrappedItemMetadata {
  /** Lazily allocated owning query ids. */
  declare [queriesKey]?: Set<any>
  /** Lazily allocated dirty query ids. */
  declare [dirtyQueriesKey]?: Set<any>

  /** Return stable owning query set. */
  get queries(): Set<any> {
    return this[queriesKey] ??= new Set()
  }

  /** Return stable dirty query set. */
  get dirtyQueries(): Set<any> {
    return this[dirtyQueriesKey] ??= new Set()
  }
}

/** Create allocation-light metadata for one wrapped item. */
export function createWrappedItemMetadata(): WrappedItemMetadata {
  return new LazyWrappedItemMetadata()
}
