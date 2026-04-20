/**
 * Reusable per-operation drizzle dispatch functions used by both the
 * individual REST handlers and the bulk `_batch` endpoint.
 *
 * Each helper runs the same hook lifecycle as the equivalent single-op
 * route so plugin hooks (security, tenant filtering, custom `where` clauses…)
 * behave identically whether an op is dispatched alone or inside a batch.
 */

export { drizzleCreate } from './create'
export { drizzleDelete } from './delete'
export { drizzleFindMany } from './findMany'
export { drizzleFindOne } from './findOne'
export type { BaseOpArgs } from './shared'
export { drizzleUpdate } from './update'
