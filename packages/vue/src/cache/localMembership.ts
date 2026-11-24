import type { CacheCreateMembership, CreatePlacement, FindManyOptions, PendingCreatePlacement, QueryPageTarget } from '@rstore/shared'
import type { CacheRuntime } from './types'
import { nextTick, shallowReactive } from 'vue'
import { queueQueryStateSweep } from './queryRetention'

/** Active exact page that a local create can refresh or place into. */
export interface LocalMembershipPage {
  /** Target at the current options. */
  target: QueryPageTarget
  /** Options of the current page. */
  findOptions: FindManyOptions<any, any, any>
  /** Metadata from the accepted response. */
  meta: Record<string, unknown>
  /** Keys in the accepted page represented by their current records. */
  rows: ReadonlyArray<Record<string, unknown>>
  /** Whether this page accepts connector inference. */
  canInfer: boolean
  /** Refresh this page using its existing transport. */
  refresh: () => void
}

interface PlacementEntry {
  /** Local operation id used by offline replay. */
  id: string
  /** Key in the cache, which may change after acknowledgement. */
  key: string | number
  /** Position relative to the accepted server page. */
  position: CreatePlacement['position']
  /** Requests opened later than this sequence can replace the placement. */
  acknowledged?: number
}

/** Use the same exact target for live placement and restart restoration. */
function targetKey(page: QueryPageTarget): string {
  return JSON.stringify([page.collection, page.id, page.provenance])
}

/** Track optimistic membership independently of serialized server page refs. */
export function createLocalMembership(ctx: CacheRuntime) {
  const providers = new Set<() => LocalMembershipPage[]>()
  const pages = shallowReactive(new Map<string, { target: QueryPageTarget, entries: PlacementEntry[] }>())
  let sequence = 0

  /** List only mounted queries for the collection being mutated. */
  function getPages(collection: string): LocalMembershipPage[] {
    const active = []
    for (const provider of providers) {
      for (const page of provider()) {
        if (page.target.collection === collection)
          active.push(page)
      }
    }
    return active
  }

  /** Store a pending or acknowledged placement without rewriting the base page. */
  function publish(placement: PendingCreatePlacement, key: string | number, acknowledged?: number) {
    for (const { page, position } of placement.targets) {
      const id = targetKey(page)
      const entries = pages.get(id)?.entries ?? []
      const entry = { id: placement.id, key, position, acknowledged }
      pages.set(id, { target: page, entries: [...entries.filter(existing => existing.id !== placement.id), entry] })
    }
  }

  const api: CacheCreateMembership = {
    prepare(collection, row, explicit) {
      const targets = new Map<string, CreatePlacement>()
      for (const entry of explicit) {
        if (entry.page.collection === collection)
          targets.set(targetKey(entry.page), { page: { ...entry.page }, position: typeof entry.position === 'string' ? entry.position : { ...entry.position } })
      }
      const store = ctx.getStore()
      const model = store.$collections.find(candidate => candidate.name === collection)
      if (model) {
        for (const page of getPages(collection)) {
          const id = targetKey(page.target)
          if (!page.canInfer || targets.has(id))
            continue
          store.$hooks.callHookSync('resolveCreatePlacement', {
            store,
            collection: model,
            findOptions: page.findOptions,
            meta: { ...page.meta },
            row,
            rows: page.rows,
            setPlacement: position => targets.set(id, { page: page.target, position }),
          })
        }
      }
      if (targets.size)
        return { id: crypto.randomUUID(), targets: [...targets.values()] }
    },
    show: publish,
    commit(placement, key, queued) {
      ctx.engine.afterPendingWrites(() => {
        publish(placement, key, queued ? undefined : ++sequence)
        if (queued)
          return
        queueQueryStateSweep(ctx, true)
        refreshTargets(placement)
      })
    },
    discard(id) {
      for (const [key, page] of pages)
        setEntries(key, page, page.entries.filter(entry => entry.id !== id))
    },
  }

  /** Revalidate the captured pages after the committed key is available. */
  function refreshTargets(placement: PendingCreatePlacement): void {
    const targetIds = new Set(placement.targets.map(({ page }) => targetKey(page)))
    const collection = placement.targets[0]?.page.collection
    if (!collection)
      return
    void nextTick(() => {
      if (ctx.disposed)
        return
      for (const page of getPages(collection)) {
        if (targetIds.delete(targetKey(page.target)))
          page.refresh()
      }
    })
  }

  /** Forget the page record when its final placement settles. */
  function setEntries(key: string, page: { target: QueryPageTarget, entries: PlacementEntry[] }, entries: PlacementEntry[]) {
    if (entries.length !== page.entries.length) {
      if (entries.length)
        pages.set(key, { target: page.target, entries })
      else
        pages.delete(key)
    }
  }

  return {
    api,
    /** Register a mounted page resolver. */
    register(provider: () => LocalMembershipPage[]) {
      providers.add(provider)
      return () => providers.delete(provider)
    },
    /** Read pending and acknowledged insertions for a page. */
    entries: (page: QueryPageTarget) => pages.get(targetKey(page))?.entries ?? [],
    /** Take a publication sequence when the network request starts. */
    beginRead: () => ++sequence,
    /** Adopt server membership after a post-acknowledgement read. */
    accept(page: QueryPageTarget, sequence: number) {
      const id = targetKey(page)
      const value = pages.get(id)
      if (value)
        setEntries(id, value, value.entries.filter(entry => entry.acknowledged === undefined || entry.acknowledged >= sequence))
    },
    /** A pending durable create is never a row GC candidate. */
    pins(collection: string, key: string | number) {
      for (const page of pages.values()) {
        if (page.target.collection === collection && page.entries.some(entry => entry.acknowledged === undefined && String(entry.key) === String(key)))
          return true
      }
      return false
    },
    /** Include inactive acknowledged placements in query retention. */
    saved() {
      return Array.from(pages.values(), page => ({
        pageId: page.target.id,
        keys: page.entries.filter(entry => entry.acknowledged !== undefined).length,
      })).filter(page => page.keys)
    },
    /** Forget only acknowledged placements when the inactive page expires. */
    evict(queryId: string) {
      for (const [id, page] of pages) {
        if (page.target.id.slice(0, page.target.id.lastIndexOf('#')) === queryId)
          setEntries(id, page, page.entries.filter(entry => entry.acknowledged === undefined))
      }
    },
    /** Reset all list memberships at an authorization boundary. */
    clear: () => pages.clear(),
  }
}
