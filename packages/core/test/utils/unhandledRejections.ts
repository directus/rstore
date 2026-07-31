import process from 'node:process'

/**
 * Collect unhandled promise rejections so tests can assert none escaped.
 * Node flags a rejection one macrotask after it settles, hence `flush()`.
 */
export function trackUnhandledRejections() {
  const unhandled: unknown[] = []
  const onUnhandledRejection = (reason: unknown) => unhandled.push(reason)
  process.on('unhandledRejection', onUnhandledRejection)
  return {
    /**
     * Wait for pending rejections to be flagged, then return the collected reasons.
     */
    async flush() {
      await new Promise(resolve => setTimeout(resolve, 10))
      return unhandled
    },
    /**
     * Remove the process listener.
     */
    stop() {
      process.off('unhandledRejection', onUnhandledRejection)
    },
  }
}
