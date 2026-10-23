import type { VueQueryPage } from './types'
import { toRaw } from 'vue'
import { getCollectionWriteVersion, getItemWriteVersion } from '../cache/queryState'
import { getMatchingPageRefs } from './confirmation'

/** One page's authoritative absence, independent of shared remount references. */
interface PageAbsence {
  /** Representation that accepted this absence. */
  source: unknown
  /** Committed row retained when the server returned absence. */
  raw: unknown
  /** Accepted write generation for this key, or collection when unkeyed. */
  writes: number
  /** A committed local change already released this absence. */
  released: boolean
}

/** Page ownership survives another consumer replacing the shared saved refs. */
const absences = new WeakMap<object, PageAbsence>()

/** Read committed identity without applying temporary optimistic layers. */
function getCommittedRow(ctx: any, key: string | number | undefined): unknown {
  const collection = ctx.getCollection()
  return key == null ? undefined : toRaw(ctx.cache._private.state.collections[collection.name]?.value[key])
}

/** Capture accepted absence before later writes or layers change its cache view. */
export function rememberPageAbsence(ctx: any, page: VueQueryPage<any, any, any, any, any>): void {
  if (page.rawData.type !== 'data' || page.rawData.value !== null) {
    absences.delete(page)
    return
  }
  const options = ctx.getPageOptions(page)
  const resolved = ctx.store.$resolveFindOptions(ctx.getCollection(), options, ctx.many, { ...ctx.meta.value })
  const cached = resolved.key == null ? ctx.cacheMethod(options, { ...ctx.meta.value }) : undefined
  const key = resolved.key ?? (cached && ctx.getCollection().getKey(cached))
  const saved = getMatchingPageRefs(ctx, page)
  absences.set(page, {
    source: page.rawData,
    raw: getCommittedRow(ctx, key),
    writes: resolved.key == null
      ? getCollectionWriteVersion(ctx.cache._private.state, ctx.getCollection().name)
      : getItemWriteVersion(ctx.cache._private.state, ctx.getCollection().name, resolved.key),
    released: saved?.type === 'data' && saved.invalidated === true,
  })
}

/** Read computed membership after a later write supersedes a saved absence. */
export function readMissingPageResult(ctx: any, page: VueQueryPage<any, any, any, any, any>): any {
  if (page._fetchPolicy == null || page._fetchPolicy === 'no-cache')
    return null
  const options = ctx.getPageOptions(page)
  const resolved = ctx.store.$resolveFindOptions(ctx.getCollection(), options, ctx.many, { ...ctx.meta.value })
  if (resolved.resultMode !== 'computed')
    return null

  // Read before checking page-owned absence so cache publication reruns the
  // decision. Wrapped identity stays stable across writes, but its raw value changes.
  const cached = ctx.cacheMethod(options, { ...ctx.meta.value }) ?? null
  const raw = cached?.$raw?.() ?? cached ?? undefined
  let absence = absences.get(page)
  if (!absence || absence.source !== page.rawData) {
    rememberPageAbsence(ctx, page)
    absence = absences.get(page)!
  }
  const collection = ctx.getCollection()
  const key = resolved.key ?? (cached && collection.getKey(cached))
  const committed = getCommittedRow(ctx, key)
  // Only committed writes permanently release absence. Layer rows may show
  // immediately, but rolling them back must restore the retained server miss.
  absence.released ||= resolved.key == null
    ? getCollectionWriteVersion(ctx.cache._private.state, collection.name) !== absence.writes
    : committed !== absence.raw || getItemWriteVersion(ctx.cache._private.state, collection.name, resolved.key) !== absence.writes
  return absence.released || raw !== absence.raw ? cached : null
}
