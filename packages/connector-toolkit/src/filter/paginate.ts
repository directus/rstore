/**
 * Options accepted by {@link paginateItems}.
 */
export interface PaginateOptions {
  /**
   * Honour a 1-based `page` query option when `offset` is absent
   * (`offset = max(0, page - 1) * limit`).
   */
  supportsPage?: boolean

  /**
   * Treat `limit` values of `0` or less as unlimited instead of literal.
   */
  unlimitedSentinels?: boolean
}

/**
 * Applies connector limit, offset, and page options to an item list.
 */
export function paginateItems<TItem>(
  items: TItem[],
  query: Record<string, any> | undefined,
  options: PaginateOptions = {},
): TItem[] {
  if (!query) {
    return items
  }

  const rawLimit = typeof query.limit === 'number' ? query.limit : undefined
  const limit = options.unlimitedSentinels && rawLimit != null && rawLimit <= 0
    ? undefined
    : rawLimit
  const offset = typeof query.offset === 'number'
    ? query.offset
    : options.supportsPage && typeof query.page === 'number' && limit != null
      ? Math.max(0, query.page - 1) * limit
      : 0

  return limit == null ? items.slice(offset) : items.slice(offset, offset + limit)
}
