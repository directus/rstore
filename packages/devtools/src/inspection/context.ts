import type { ProjectionBudget } from '../projection'
import type { PreviewValue } from '../protocol'
import type { StoreRegistration } from '../runtime/types'
import { createProjectionBudget, projectValue } from '../projection'

/** One reply-wide allowance, shared across rows and metadata sections. */
export function createInspectionContext(registration: StoreRegistration, budget: ProjectionBudget = createProjectionBudget(448 * 1024)) {
  let truncated = false
  return {
    /** True when a section exceeded traversal or reply allowance. */
    get truncated() { return truncated },
    /** Remaining encoded value allowance, excluding wrapper reserve. */
    get remainingBytes() { return budget.remainingBytes },
    /** Stop a section when source scan or metadata was incomplete. */
    markTruncated() { truncated = true },
    /** Account for an already detached DTO, without reprojecting its wire shape. */
    consume(bytes: number) { budget.consume(bytes) },
    /** Detach one value before transport/retention. */
    project(value: unknown): PreviewValue {
      const result = projectValue(value, { unwrap: registration.adapter?.unwrap, budget })
      truncated ||= result.truncated
      return result.value
    },
  }
}
/** Reply context passed through every section, not recreated per row. */
export type InspectionContext = ReturnType<typeof createInspectionContext>

/** Use only public cache reader or explicitly registered adapter capability. */
export function inspectCache(registration: StoreRegistration) {
  return registration.adapter?.readCache
    ? registration.adapter.readCache(registration.store)
    : registration.store.$cache.inspect?.()
}
