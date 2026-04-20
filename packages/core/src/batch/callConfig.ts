import type { BatchCallConfig } from '@rstore/shared'

/**
 * Result of normalizing a per-call `batch` setting.
 *
 * - `enabled` — `false` means the caller opted out of batching
 * - `group` — explicit group name if provided, else `undefined` (scheduler uses default)
 */
export interface ResolvedBatchCall {
  enabled: boolean
  group: string | undefined
}

/**
 * Normalize the per-call `batch` option into `{ enabled, group }`.
 *
 * - `false` → opted out
 * - `true` / `undefined` → enabled, default group
 * - `{ group }` → enabled, explicit group
 */
export function resolveBatchCall(config: BatchCallConfig | undefined): ResolvedBatchCall {
  if (config === false) {
    return { enabled: false, group: undefined }
  }
  if (typeof config === 'object' && config !== null) {
    return { enabled: true, group: config.group }
  }
  return { enabled: true, group: undefined }
}
