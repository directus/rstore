import { projectValue } from '../projection'
import { dataProperty } from '../projection/values'

/** Project allowed failure fields only; never traverse H3 data, cause or request state. */
export function projectSSRFailure(source: unknown, maxBytes: number) {
  let name = 'Error'
  let message = typeof source === 'string' ? source : 'SSR request failed'
  let status: unknown
  if (source && typeof source === 'object') {
    try {
      const sourceName = dataProperty(source, 'name')
      const sourceMessage = dataProperty(source, 'message')
      if (typeof sourceName === 'string')
        name = sourceName
      if (typeof sourceMessage === 'string')
        message = sourceMessage
      status = dataProperty(source, 'statusCode') ?? dataProperty(source, 'status')
    }
    catch { /* Hostile reflection is unavailable metadata, never an app failure. */ }
  }
  // Construct a fresh error so generic projection sees no application-owned fields.
  const failure = new Error(message.slice(0, 8192))
  Object.defineProperty(failure, 'name', { value: name.slice(0, 128) })
  if (typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599)
    Object.defineProperty(failure, 'statusCode', { value: status, enumerable: true })
  return projectValue(failure, { maxBytes }).value
}
