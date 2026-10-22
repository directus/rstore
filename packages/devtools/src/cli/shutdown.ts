import process from 'node:process'

/** Signal and explicit teardown share one bounded cleanup operation. */
export function ownCliShutdown(close: () => Promise<void>, timeoutMs = 5_000) {
  let pending: Promise<void> | undefined
  /** Remove only listeners installed by this CLI instance. */
  function removeListeners() {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
  }
  /** Stop owned resources once; retain failure rather than reporting false success. */
  function stop(): Promise<void> {
    if (pending)
      return pending
    removeListeners()
    let timer: ReturnType<typeof setTimeout> | undefined
    pending = Promise.race([
      Promise.resolve().then(close),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Devtools shutdown timed out')), timeoutMs) }),
    ]).finally(() => {
      if (timer)
        clearTimeout(timer)
    })
    return pending
  }
  /** A signal terminates process after owned cleanup, including bounded failures. */
  function onSignal() {
    void stop().then(() => process.exit(0), (error) => {
      console.error(error instanceof Error ? error.message : 'Devtools shutdown failed')
      process.exit(1)
    })
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  return { stop }
}
