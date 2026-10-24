/**
 * Bounds for cached metadata that would otherwise grow for the store's
 * lifetime. Omitted limits use the structure's defaults.
 */
export interface RetentionOptions {
  /**
   * Drop an entry once it was last used this many milliseconds ago.
   * `Infinity` disables expiration.
   */
  ttlMs?: number
  /**
   * Keep at most this many evictable entries, dropping the least recently
   * used first. `Infinity` disables the limit, `0` keeps none.
   */
  maxSize?: number
}
