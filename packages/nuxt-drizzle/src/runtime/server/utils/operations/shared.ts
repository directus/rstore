import type { H3Event } from 'h3'
import type { QueryObject } from 'ufo'
import type { RstoreDrizzleTransformQuery } from '../hooks'

/**
 * Shared argument shape passed to every operation helper.
 * `params` / `query` are per-op — in the batch endpoint the same h3 event
 * is reused but each op carries its own route/query metadata.
 */
export interface BaseOpArgs {
  event: H3Event
  collection: string
  params?: Record<string, string>
  query?: QueryObject
}

/**
 * Run the list of query transforms registered by `before` hooks, collecting
 * additional `where` conditions and `extras` into the output objects.
 */
export function applyTransforms(
  transforms: RstoreDrizzleTransformQuery[],
  whereConditions: any[],
  extras: Record<string, any>,
) {
  for (const transform of transforms) {
    transform({
      where: condition => whereConditions.push(condition),
      extras: e => Object.assign(extras, e),
    })
  }
}
