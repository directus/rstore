import type { ApplyMutationOptions, DeprecatedCacheDeleteAliases, DeprecatedCacheWriteAliases } from '@rstore/shared'

/**
 * Forward the deprecated `fieldTimestamps` / `deletedAt` mutation options to
 * the cache untouched; `@rstore/vue` maps them onto `metadata`. Removed in 0.10.
 *
 * @param options Finalize or mutate options that may carry the aliases.
 * @param applyOptions Cache apply options being built; mutated.
 */
export function forwardDeprecatedMutationAliases(
  options: DeprecatedCacheWriteAliases & DeprecatedCacheDeleteAliases,
  applyOptions: ApplyMutationOptions<any, any, any>,
): void {
  if (options.fieldTimestamps !== undefined) {
    applyOptions.fieldTimestamps = options.fieldTimestamps
  }
  if (options.deletedAt !== undefined) {
    applyOptions.deletedAt = options.deletedAt
  }
}
