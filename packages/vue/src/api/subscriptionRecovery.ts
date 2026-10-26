/** Services needed to recover through the owning query's transition queue. */
interface SubscriptionRecoveryOptions {
  /** Check revision, disposal and current page selection before doing work. */
  isCurrent: (revision: number) => boolean
  /** Open the current subscription, retaining failed transport cleanup. */
  reopen: (revision: number) => Promise<void>
  /** Close the ended subscription or a partially acquired replacement. */
  close: () => Promise<void>
  /** Fetch changes missed before the replacement subscription opened. */
  refresh: () => Promise<unknown>
  /** Serialize transport work with other pages and option transitions. */
  enqueue: (task: () => Promise<void>, cleanup?: boolean) => Promise<void>
}

/** Three attempts at 1s, 2s and 4s, shared until a result confirms a healthy subscription. */
export function createSubscriptionRecovery(options: SubscriptionRecoveryOptions) {
  let attempts = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  /** Cancel pending backoff and renew the budget after a new read or healthy result. */
  function reset(): void {
    clearTimeout(timer)
    timer = undefined
    attempts = 0
  }

  /** Refresh once if this recovery still owns the followed page. */
  function refresh(revision: number): void {
    if (options.isCurrent(revision)) {
      void options.refresh().then(() => {
        // Registration alone is not health: immediate kickouts must retain
        // their budget. Only a result still owned by this revision renews it.
        if (options.isCurrent(revision))
          reset()
      }).catch(() => {})
    }
  }

  /** Account for work blocked by a retained teardown in the transition queue. */
  function enqueue(task: () => Promise<void>, blocked: () => void, cleanup = false): void {
    let entered = false
    void options.enqueue(async () => {
      entered = true
      await task()
    }, cleanup).then(() => {
      // Queue completion does not imply execution: failed teardown can retain
      // a replacement, or already represent cleanup. Keep backoff progressing.
      if (!entered)
        blocked()
    }).catch(() => {
      // The local queue propagates teardown errors to explicit callers.
      // Recovery already scheduled its continuation in the close's finally.
    })
  }

  /** Queue one bounded retry; failed registration consumes the same budget. */
  function retry(revision: number): void {
    if (timer || !options.isCurrent(revision))
      return
    if (attempts >= 3) {
      refresh(revision)
      return
    }
    const delay = 1000 * 2 ** attempts++
    timer = setTimeout(() => {
      timer = undefined
      if (!options.isCurrent(revision))
        return
      enqueue(async () => {
        if (!options.isCurrent(revision))
          return
        try {
          await options.reopen(revision)
        }
        catch {
          // Consume failure here: unrelated page activity must not retry this
          // opening through the queue, bypassing backoff and the attempt limit.
          end(revision, true)
          return
        }
        refresh(revision)
      }, () => end(revision, true))
    }, delay)
  }

  /** Release the ended lease, then back off or perform the final refresh. */
  function end(revision: number, shouldRetry: boolean): void {
    // Superseded reopen/catch callbacks must never replace newer queued work.
    if (!options.isCurrent(revision))
      return
    /** Continue only while this revision still owns recovery. */
    const afterClose = () => shouldRetry ? retry(revision) : refresh(revision)
    enqueue(async () => {
      // Ownership may change again while waiting for another page's transport.
      if (!options.isCurrent(revision))
        return
      try {
        await options.close()
      }
      finally {
        afterClose()
      }
    }, afterClose, true)
  }

  return { end, reset }
}
