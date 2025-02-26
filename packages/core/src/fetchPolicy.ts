import type { FetchPolicy } from '@rstore/shared'

export const defaultFetchPolicy: FetchPolicy = 'cache-first'

export function shouldReadCacheFromFetchPolicy(fetchPolicy: FetchPolicy | null | undefined) {
  return fetchPolicy === 'cache-and-fetch' || fetchPolicy === 'cache-first' || fetchPolicy === 'cache-only'
}

export function shouldFetchDataFromFetchPolicy(fetchPolicy: FetchPolicy | null | undefined) {
  return fetchPolicy === 'cache-and-fetch' || fetchPolicy === 'cache-first' || fetchPolicy === 'no-cache'
}
