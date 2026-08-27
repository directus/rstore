import type { MutableEngineChangeSet } from './change-set.js'
import type { EngineContext, KeyId } from './internal-types.js'
import type { EngineChangeInterest } from './observer-changes.js'
import { createEngineChangeSet, isChangeSetEmpty } from './change-set.js'

/** Flush-local aggregate allocated only after one observed change. */
export interface FlushChangeRecorder {
  /** Aggregate observer payload, when any dependency was recorded. */
  changes?: MutableEngineChangeSet
}

/** Operation-local selective recorder hidden from public callbacks. */
export interface ChangeRecorder {
  /** Owning engine context. */
  ctx: EngineContext
  /** Immediate callback interest; `true` preserves unfiltered behavior. */
  interest?: true | EngineChangeInterest
  /** Flush-local aggregate destination. */
  flush: FlushChangeRecorder
  /** Immediate callback payload, lazily allocated. */
  operation?: MutableEngineChangeSet
}

const NO_CHANGE_RECORDER = undefined

/** Create one empty flush aggregate holder. */
export function createFlushChangeRecorder(): FlushChangeRecorder {
  return {}
}

/** Capture active state and observer interests for one operation. */
export function createChangeRecorder(ctx: EngineContext, flush: FlushChangeRecorder): ChangeRecorder | undefined {
  let interest: true | EngineChangeInterest | undefined
  if (ctx.callbacks.onStateChange) {
    interest = ctx.callbacks.getStateChangeInterest
      ? ctx.callbacks.getStateChangeInterest()
      : true
  }
  const hasImmediateInterest = interest === true || Boolean(
    interest && (interest.itemKeys.size || interest.lists.size || interest.indexes.size),
  )
  if (!hasImmediateInterest && !ctx.callbacks.onObserverFlush && !ctx.observers.hasAny())
    return NO_CHANGE_RECORDER
  return { ctx, interest: hasImmediateInterest ? interest : undefined, flush }
}

/** Record one canonical item only for interested immediate/final consumers. */
export function recordItem(recorder: ChangeRecorder | undefined, collection: string, key: string | number): void {
  if (!recorder)
    return
  const id = String(key)
  if (wantsImmediateItem(recorder.interest, collection, id))
    addItem(ensureOperation(recorder), collection, id)
  if (recorder.ctx.callbacks.onObserverFlush || recorder.ctx.observers.hasItem(collection, id))
    addItem(ensureFlush(recorder), collection, id)
}

/** Record one collection membership only for interested consumers. */
export function recordList(recorder: ChangeRecorder | undefined, collection: string): void {
  if (!recorder)
    return
  if (recorder.interest === true || recorder.interest?.lists.has(collection))
    ensureOperation(recorder).lists.add(collection)
  if (recorder.ctx.callbacks.onObserverFlush || recorder.ctx.observers.hasList(collection))
    ensureFlush(recorder).lists.add(collection)
}

/** Return whether dependency encoding can produce an observable index change. */
export function mayRecordIndex(recorder: ChangeRecorder | undefined, collection: string): boolean {
  if (!recorder)
    return false
  return recorder.interest === true
    || Boolean(recorder.interest?.indexes.get(collection)?.size)
    || Boolean(recorder.ctx.callbacks.onObserverFlush)
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
  if (recorder.interest === true || recorder.ctx.callbacks.onObserverFlush)
    return true
  if (!dependency) {
    return Boolean(recorder.interest?.indexes.get(collection)?.size)
      || recorder.ctx.observers.hasIndexCollection(collection)
  }
  return Boolean(recorder.interest?.indexes.get(collection)?.has(dependency))
    || recorder.ctx.observers.hasIndex(dependency)
}

/** Record one already-encoded opaque index dependency. */
export function recordIndex(recorder: ChangeRecorder | undefined, collection: string, dependency: string): void {
  if (!recorder)
    return
  if (recorder.interest === true || recorder.interest?.indexes.get(collection)?.has(dependency))
    ensureOperation(recorder).indexes.add(dependency)
  if (recorder.ctx.callbacks.onObserverFlush || recorder.ctx.observers.hasIndex(dependency))
    ensureFlush(recorder).indexes.add(dependency)
}

/** Record reset invalidations without scanning unrelated item identities. */
export function recordCollectionReset(
  recorder: ChangeRecorder | undefined,
  collection: string,
  previousIds: readonly KeyId[],
  nextIds: readonly KeyId[],
): void {
  if (!recorder)
    return
  if (recorder.interest === true) {
    const changes = ensureOperation(recorder)
    addItems(changes, collection, previousIds)
    addItems(changes, collection, nextIds)
    changes.lists.add(collection)
  }
  else if (recorder.interest) {
    const keys = recorder.interest.itemKeys.get(collection)
    if (keys === true) {
      const changes = ensureOperation(recorder)
      addItems(changes, collection, previousIds)
      addItems(changes, collection, nextIds)
    }
    else if (keys?.size) {
      addItems(ensureOperation(recorder), collection, keys)
    }
    if (recorder.interest.lists.has(collection))
      ensureOperation(recorder).lists.add(collection)
    for (const dependency of recorder.interest.indexes.get(collection) ?? [])
      ensureOperation(recorder).indexes.add(dependency)
  }

  if (recorder.ctx.callbacks.onObserverFlush) {
    const changes = ensureFlush(recorder)
    addItems(changes, collection, previousIds)
    addItems(changes, collection, nextIds)
    changes.lists.add(collection)
  }
  else {
    for (const key of recorder.ctx.observers.itemKeys(collection))
      addItem(ensureFlush(recorder), collection, key)
    if (recorder.ctx.observers.hasList(collection))
      ensureFlush(recorder).lists.add(collection)
  }
  for (const dependency of recorder.ctx.observers.indexDependencies(collection))
    ensureFlush(recorder).indexes.add(dependency)
}

/** Return non-empty operation payload for immediate framework synchronization. */
export function getOperationChanges(recorder: ChangeRecorder | undefined): MutableEngineChangeSet | undefined {
  return recorder?.operation && !isChangeSetEmpty(recorder.operation) ? recorder.operation : undefined
}

/** Return non-empty aggregate payload for final framework/direct observers. */
export function getFlushChanges(flush: FlushChangeRecorder): MutableEngineChangeSet | undefined {
  return flush.changes && !isChangeSetEmpty(flush.changes) ? flush.changes : undefined
}

/** Lazily allocate one immediate callback payload. */
function ensureOperation(recorder: ChangeRecorder): MutableEngineChangeSet {
  return recorder.operation ??= createEngineChangeSet()
}

/** Lazily allocate one final aggregate payload. */
function ensureFlush(recorder: ChangeRecorder): MutableEngineChangeSet {
  return recorder.flush.changes ??= createEngineChangeSet()
}

/** Return whether immediate callback consumes one exact item. */
function wantsImmediateItem(interest: true | EngineChangeInterest | undefined, collection: string, key: KeyId): boolean {
  if (interest === true)
    return true
  const keys = interest?.itemKeys.get(collection)
  return keys === true || Boolean(keys?.has(key))
}

/** Add one canonical item identity to a mutable payload. */
function addItem(changes: MutableEngineChangeSet, collection: string, key: KeyId): void {
  const keys = changes.items.get(collection) ?? new Set<KeyId>()
  changes.items.set(collection, keys)
  keys.add(key)
}

/** Add several canonical item identities to a mutable payload. */
function addItems(changes: MutableEngineChangeSet | undefined, collection: string, keys: Iterable<KeyId>): void {
  if (!changes)
    return
  for (const key of keys) addItem(changes, collection, key)
}
