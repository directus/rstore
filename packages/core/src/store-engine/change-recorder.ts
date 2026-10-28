import type { MutableEngineChangeSet } from './change-set.js'
import type { OperationChangeSink } from './change-sink.js'
import type { EngineContext, KeyId } from './internal-types.js'
import { createEngineChangeSet, isChangeSetEmpty } from './change-set.js'
import { commitOperationChangeSink, createOperationChangeSink, discardOperationChangeSink, maySinkIndex, maySinkIndexDependency, recordSinkIndex, recordSinkItem, recordSinkList, recordSinkReset } from './change-sink.js'

/** Flush-local aggregate allocated only after one observed change. */
export interface FlushChangeRecorder {
  /** Aggregate observer payload, when any dependency was recorded. */
  changes?: MutableEngineChangeSet
}

/** Operation-local selective recorder hidden from framework adapters. */
export interface ChangeRecorder {
  /** Owning engine context. */
  ctx: EngineContext
  /** Flush-local aggregate destination. */
  flush: FlushChangeRecorder
  /** Active allocation-light framework sink for this operation. */
  sink?: OperationChangeSink
}

const NO_CHANGE_RECORDER = undefined

/** Create one empty flush aggregate holder. */
export function createFlushChangeRecorder(): FlushChangeRecorder {
  return {}
}

/** Capture active framework sink and direct observer interests for one operation. */
export function createChangeRecorder(ctx: EngineContext, flush: FlushChangeRecorder): ChangeRecorder | undefined {
  const stateSink = ctx.callbacks.stateChangeSink
  const sinkSelector = stateSink?.getInterest
  const sink = createOperationChangeSink(stateSink, sinkSelector?.(), Boolean(sinkSelector))
  if (!sink && !ctx.observers.hasAny())
    return NO_CHANGE_RECORDER
  return { ctx, flush, sink }
}

/** Record one canonical item only for interested immediate/final consumers. */
export function recordItem(
  recorder: ChangeRecorder | undefined,
  collection: string,
  key: string | number,
  value?: unknown,
  keyFormChange?: { previousKey: string | number, key: string | number },
): void {
  if (!recorder)
    return
  const id = String(key)
  recordSinkItem(recorder.sink, collection, id, value, keyFormChange)
  if (recorder.ctx.observers.hasItem(collection, id))
    addItem(ensureFlush(recorder), collection, id)
}

/** Record one collection membership only for interested consumers. */
export function recordList(recorder: ChangeRecorder | undefined, collection: string): void {
  if (!recorder)
    return
  recordSinkList(recorder.sink, collection)
  if (recorder.ctx.observers.hasList(collection))
    ensureFlush(recorder).lists.add(collection)
}

/** Return whether dependency encoding can produce an observable index change. */
export function mayRecordIndex(recorder: ChangeRecorder | undefined, collection: string): boolean {
  if (!recorder)
    return false
  return maySinkIndex(recorder.sink, collection)
    || recorder.ctx.observers.hasIndexCollection(collection)
}

/** Return whether one cached dependency has an active consumer. */
export function mayRecordIndexDependency(
  recorder: ChangeRecorder | undefined,
  collection: string,
  dependency: string | undefined,
): boolean {
  if (!recorder)
    return false
  if (maySinkIndexDependency(recorder.sink, collection, dependency))
    return true
  if (!dependency) {
    // Selective readers and direct observers cache every dependency when they
    // subscribe. An unseen membership therefore cannot match active exact
    // interest and needs no dependency string construction.
    return false
  }
  return recorder.ctx.observers.hasIndex(dependency)
}

/** Record one already-encoded opaque index dependency. */
export function recordIndex(recorder: ChangeRecorder | undefined, collection: string, dependency: string): void {
  if (!recorder)
    return
  recordSinkIndex(recorder.sink, collection, dependency)
  if (recorder.ctx.observers.hasIndex(dependency))
    ensureFlush(recorder).indexes.add(dependency)
}

/** Record reset invalidations without scanning unrelated item identities. */
export function recordCollectionReset(
  recorder: ChangeRecorder | undefined,
  collection: string,
): void {
  if (!recorder)
    return
  recordSinkReset(recorder.sink, collection)
  for (const key of recorder.ctx.observers.itemKeys(collection))
    addItem(ensureFlush(recorder), collection, key)
  if (recorder.ctx.observers.hasList(collection))
    ensureFlush(recorder).lists.add(collection)
  for (const dependency of recorder.ctx.observers.indexDependencies(collection))
    ensureFlush(recorder).indexes.add(dependency)
}

/** Return non-empty aggregate payload for final framework/direct observers. */
export function getFlushChanges(flush: FlushChangeRecorder): MutableEngineChangeSet | undefined {
  return flush.changes && !isChangeSetEmpty(flush.changes) ? flush.changes : undefined
}

/** Publish or discard one operation-local fast sink buffer. */
export function commitStateChangeSink(recorder: ChangeRecorder | undefined): void {
  commitOperationChangeSink(recorder?.sink)
}

/** Discard one sink buffer after failure before state publication. */
export function discardStateChangeSink(recorder: ChangeRecorder | undefined): void {
  discardOperationChangeSink(recorder?.sink)
}

/** Lazily allocate one final aggregate payload. */
function ensureFlush(recorder: ChangeRecorder): MutableEngineChangeSet {
  return recorder.flush.changes ??= createEngineChangeSet()
}

/** Add one canonical item identity to a mutable payload. */
function addItem(changes: MutableEngineChangeSet, collection: string, key: KeyId): void {
  const keys = changes.items.get(collection) ?? new Set<KeyId>()
  changes.items.set(collection, keys)
  keys.add(key)
}
