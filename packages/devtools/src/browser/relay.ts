import type { RelayConnectionOptions } from '../node/rpc'
import type { RstoreDevtools } from '../runtime/types'
import { connectProducer } from '../node/producer'

/** Optional authenticated page producer, independent from panel asset origin. */
export function connectBrowserRelay(runtime: RstoreDevtools, options: RelayConnectionOptions) {
  return connectProducer(runtime, { ...options, baseURL: new URL(options.baseURL, location.href).href })
}
