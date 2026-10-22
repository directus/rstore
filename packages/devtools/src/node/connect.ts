import type { RstoreDevtools } from '../runtime/types'
import type { RelayConnectionOptions } from './rpc'
import { producerBaseURL } from '../devframe/paths'
import { connectProducer } from './producer'

/** Explicit Node producer; native Node WebSocket owns transport, caller owns store. */
export function connectRstoreDevtools(runtime: RstoreDevtools, options: RelayConnectionOptions) {
  producerBaseURL(options.baseURL)
  return connectProducer(runtime, options)
}
