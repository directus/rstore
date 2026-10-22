import type { CacheInspectionLayer, CacheInspectionRow } from '@rstore/shared'
import type { CacheLayerSummary, CachePage, CacheRequest } from '../protocol'
import type { StoreRegistration } from '../runtime/types'
import type { InspectionContext } from './context'
import { projectValue } from '../projection'
import { DevtoolsError } from '../protocol'
import { inspectCache } from './context'
import { readCacheMetadata } from './metadata'

/** Stable cross-runtime ordering, preserving numeric/string address distinction. */
function compareRows(left: CacheInspectionRow, right: CacheInspectionRow): number {
  const a = String(left.key)
  const b = String(right.key)
  return a < b ? -1 : a > b ? 1 : typeof left.key < typeof right.key ? -1 : typeof left.key > typeof right.key ? 1 : 0
}

/** Bound layer metadata separately from scanning selected data rows. */
function layersMetadata(layers: Iterable<CacheInspectionLayer>, context: InspectionContext): CacheLayerSummary[] {
  const result: CacheLayerSummary[] = []
  for (const layer of layers) {
    if (result.length >= 1000 || context.remainingBytes < 1024) {
      context.markTruncated()
      break
    }
    const deleted: Array<string | number> = []
    for (const key of layer.deletedKeys()) {
      if (deleted.length >= 1000) {
        context.markTruncated()
        break
      }
      deleted.push(key)
    }
    result.push({ id: layer.id, collection: layer.collectionName, optimistic: layer.optimistic, skip: layer.skip, prevent: { ...layer.prevent }, deletedKeys: context.project(deleted) })
  }
  return result
}

/** Scan bounded candidate set, filter before sort/page, project only returned rows. */
export function readCache(registration: StoreRegistration, request: CacheRequest, context: InspectionContext): CachePage | undefined {
  const inspection = inspectCache(registration)
  if (!inspection)
    return undefined
  const collection = inspection.collections.find(candidate => candidate.name === request.collection)
  if (!collection)
    throw new DevtoolsError({ code: 'UNAVAILABLE', message: `Unknown collection: ${request.collection}`, target: registration.target })
  let rows = request.view === 'committed' ? collection.rows() : collection.effectiveRows()
  const total = request.view === 'committed' ? collection.count : collection.effectiveCount
  if (request.layerId !== undefined) {
    let selected: CacheInspectionLayer | undefined
    let visited = 0
    for (const layer of inspection.layers()) {
      if (++visited > 1000)
        break
      if (layer.id === request.layerId && layer.collectionName === request.collection) {
        selected = layer
        break
      }
    }
    if (!selected)
      throw new DevtoolsError({ code: 'UNAVAILABLE', message: 'Cache layer unavailable', target: registration.target })
    rows = selected.rows()
  }
  const matches: CacheInspectionRow[] = []
  let scanned = 0
  let scanTruncated = false
  for (const row of rows) {
    scanned++
    if (row.truncated)
      context.markTruncated()
    let matchesFilter = request.keySearch === undefined || String(row.key).includes(request.keySearch)
    if (matchesFilter && request.contentSearch !== undefined) {
      const preview = projectValue(row.value, { unwrap: registration.adapter?.unwrap })
      if (preview.truncated)
        context.markTruncated()
      matchesFilter = JSON.stringify(preview.value).includes(request.contentSearch)
    }
    if (matchesFilter)
      matches.push(row)
    if (scanned === 10_000) {
      // Avoid pulling a 10,001st candidate just to discover overflow. Public
      // collection counts decide completeness; lazy layers have no exact count.
      scanTruncated = request.layerId !== undefined || total > scanned
      break
    }
  }
  if (scanTruncated)
    context.markTruncated()
  matches.sort(compareRows)
  const result: CachePage = {
    rows: [],
    total,
    matchingTotal: scanTruncated ? null : matches.length,
    offset: request.page.offset,
    limit: request.page.limit,
    scanTruncated,
  }
  for (const row of matches.slice(request.page.offset, request.page.offset + request.page.limit)) {
    if (context.remainingBytes < 1024) {
      context.markTruncated()
      break
    }
    result.rows.push({ key: row.key, value: context.project(row.value) })
  }
  result.layers = layersMetadata(inspection.layers(), context)
  if (context.remainingBytes >= 1024)
    result.metadata = readCacheMetadata(inspection.metadata(), context)
  else
    context.markTruncated()
  return result
}
