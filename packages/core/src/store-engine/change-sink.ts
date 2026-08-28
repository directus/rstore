import type { EngineChangeInterest } from './observer-changes.js'
import type { EngineStateChangeSink } from './types.js'

/** Lazy operation-local state for one advanced framework sink. */
export interface OperationChangeSink {
  /** Configured sink callback. */
  sink: EngineStateChangeSink
  /** Selector captured before operation, when configured. */
  interest?: EngineChangeInterest
  /** Whether selector semantics apply even when no interest exists. */
  selective: boolean
  /** Whether begin already ran. */
  begun: boolean
  /** Result returned by begin. */
  active: boolean
  /** Whether one matching dependency was recorded. */
  changed: boolean
}

/** Create lazy selective or eager compatibility sink state. */
export function createOperationChangeSink(
  sink: EngineStateChangeSink | undefined,
  interest: EngineChangeInterest | undefined,
  selective: boolean,
): OperationChangeSink | undefined {
  if (!sink || (selective && !hasInterest(interest)))
    return undefined
  const state: OperationChangeSink = { sink, interest, selective, begun: false, active: false, changed: false }
  if (!selective && !beginSink(state))
    return undefined
  return state
}

/** Record one matching item after lazily starting sink operation. */
export function recordSinkItem(state: OperationChangeSink | undefined, collection: string, key: string, value: unknown, keyForm?: { previousKey: string | number, key: string | number }): void {
  if (!state || (state.selective && !wantsItem(state.interest, collection, key)) || !beginSink(state) || (!state.selective && !state.sink.wantsItem(collection, key)))
    return
  state.sink.recordItem(collection, key, value, keyForm)
  state.changed = true
}

/** Record one matching list after lazily starting sink operation. */
export function recordSinkList(state: OperationChangeSink | undefined, collection: string): void {
  if (!state || (state.selective && !state.interest?.lists.has(collection)) || !beginSink(state) || (!state.selective && !state.sink.wantsList(collection)))
    return
  state.sink.recordList(collection)
  state.changed = true
}

/** Record one matching index after lazily starting sink operation. */
export function recordSinkIndex(state: OperationChangeSink | undefined, collection: string, dependency: string): void {
  if (!state || (state.selective && !state.interest?.indexes.get(collection)?.has(dependency)) || !beginSink(state) || (!state.selective && !state.sink.wantsIndex(dependency)))
    return
  state.sink.recordIndex(dependency)
  state.changed = true
}

/** Record one reset when selector has any dependency in collection. */
export function recordSinkReset(state: OperationChangeSink | undefined, collection: string): void {
  if (!state || (state.selective && !wantsCollection(state.interest, collection)) || !beginSink(state))
    return
  state.sink.recordCollectionReset(collection)
  state.changed = true
}

/** Return whether index plan may affect selected sink collection. */
export function maySinkIndex(state: OperationChangeSink | undefined, collection: string): boolean {
  return Boolean(state && (!state.selective || state.interest?.indexes.get(collection)?.size))
}

/** Return whether exact index dependency can affect selected sink. */
export function maySinkIndexDependency(state: OperationChangeSink | undefined, collection: string, dependency: string | undefined): boolean {
  return Boolean(state && (!state.selective || (dependency && state.interest?.indexes.get(collection)?.has(dependency))))
}

/** Commit matching changes or discard empty begun operation. */
export function commitOperationChangeSink(state: OperationChangeSink | undefined): void {
  if (!state?.active)
    return
  if (state.changed)
    state.sink.commit()
  else state.sink.discard()
}

/** Discard begun operation after pre-commit failure. */
export function discardOperationChangeSink(state: OperationChangeSink | undefined): void {
  if (state?.active)
    state.sink.discard()
}

/** Start sink once after selector proves one dependency may match. */
function beginSink(state: OperationChangeSink): boolean {
  if (!state.begun) {
    state.begun = true
    state.active = state.sink.begin()
  }
  return state.active
}

/** Return whether selector contains any immediate dependency. */
function hasInterest(interest: EngineChangeInterest | undefined): boolean {
  return Boolean(interest && (interest.itemKeys.size || interest.lists.size || interest.indexes.size))
}

/** Match exact or collection-wide item interest. */
function wantsItem(interest: EngineChangeInterest | undefined, collection: string, key: string): boolean {
  const keys = interest?.itemKeys.get(collection)
  return keys === true || Boolean(keys?.has(key))
}

/** Match any dependency owned by one collection reset. */
function wantsCollection(interest: EngineChangeInterest | undefined, collection: string): boolean {
  return Boolean(interest?.itemKeys.has(collection) || interest?.lists.has(collection) || interest?.indexes.get(collection)?.size)
}
