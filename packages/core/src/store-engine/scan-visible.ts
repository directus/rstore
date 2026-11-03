import type { EngineCollectionState, EngineContext, KeyId } from './internal-types.js'
import { getPublicKey } from './identity.js'
import { getVisibleKeyIds, resolveItemById } from './view.js'

/** Caller decision for one visible identity before the engine resolves it. */
export type VisibleRowReuse = (id: KeyId) => boolean

/** Visitor receiving one resolved visible row with its canonical identity. */
export type VisibleRowVisitor = (key: string | number, item: unknown, id: KeyId) => void

/**
 * Visit a collection's visible rows in order, letting the caller keep rows it
 * already materialized. Reuse is offered only while no optimistic layer is
 * installed: a layer can replace a row's wrapper without changing its id.
 */
export function scanVisibleRows(
  ctx: EngineContext,
  collectionName: string,
  marker: string | undefined,
  reuse: VisibleRowReuse,
  visit: VisibleRowVisitor,
): void {
  if (marker !== undefined && !ctx.markers[marker])
    return
  const state = ctx.collections.get(collectionName)
  if (!state)
    return
  const canReuse = state.layers.length === 0
  // Ordinary default-key rows need no sparse-map or layer resolution:
  // write/hydration registration guarantees current item key identity.
  const directDefaultKeys = canReuse && state.usesDefaultKey && !state.keyOverrides
  // Without layers the base map is the visible set in the same order, so skip
  // materializing (and later invalidating) a copy of every id.
  for (const id of canReuse ? state.base.keys() : getVisibleKeyIds(state)) {
    if (canReuse && reuse(id))
      continue
    const item = resolveItemById(state, id)
    if (item !== undefined)
      visit(visiblePublicKey(state, id, item, directDefaultKeys), item, id)
  }
}

/** Return the public key of one visible row. */
function visiblePublicKey(state: EngineCollectionState, id: KeyId, item: any, directDefaultKeys: boolean): string | number {
  return directDefaultKeys
    ? item.$overrideKey ?? item.id ?? item.__id ?? id
    : getPublicKey(state, id, item)
}
