/** One page scope's serialized transport work. */
export interface SubscriptionQueueOwner {
  /** Queue a replacement or cleanup, superseding this scope's older work. */
  enqueue: (task: () => Promise<void>, cleanup?: boolean) => Promise<void>
  /** Preserve exact failed teardown identity until a later transition retries. */
  retainTeardown: (retry: () => Promise<void>) => void
}

/** Latest desired transition for one subscription scope. */
interface Transition {
  /** Transport operation, retaining its captured options/revision. */
  run: () => Promise<void>
  /** Cleanup must proceed even when an unrelated page cannot close. */
  cleanup: boolean
}

/** Page scope with independently retained transport ownership. */
interface Owner {
  /** Selected slot; replacements cannot overlap an older scope at this index. */
  index: number
  /** Latest failed close, including remote identity held by its closure. */
  teardown?: () => Promise<void>
  /** Latest desired work; disposal supersedes a blocked replacement. */
  transition?: Transition
}

/** Serialize transports, retry failed owners once per new external transition. */
export function createSubscriptionQueue(): (index: number) => SubscriptionQueueOwner {
  const owners = new Set<Owner>()
  let queue = Promise.resolve()

  /** Attempt retained work once, allowing every independent owner to progress. */
  async function run(): Promise<void> {
    for (const owner of owners) {
      const retry = owner.teardown
      if (!retry)
        continue
      try {
        await retry()
        if (owner.teardown === retry)
          owner.teardown = undefined
      }
      catch {
        // Keep exact closing identity; another enqueue supplies the next retry.
      }
    }
    for (const owner of owners) {
      const transition = owner.transition
      if (!transition)
        continue
      const blocked = [...owners].some(other => other.index === owner.index && other.teardown)
      if (blocked && !transition.cleanup)
        continue
      // Retained teardown already represents this cleanup, including failure.
      if (!owner.teardown) {
        try {
          await transition.run()
        }
        catch {
          if (!transition.cleanup)
            continue
        }
      }
      if (owner.transition === transition)
        owner.transition = undefined
    }
    for (const owner of owners) {
      if (!owner.transition && !owner.teardown)
        owners.delete(owner)
    }
  }

  /** Bind all transitions and teardown retries to one page scope. */
  return (index) => {
    const owner: Owner = { index }
    return {
      enqueue(task, cleanup = false) {
        owner.transition = { run: task, cleanup }
        owners.add(owner)
        queue = queue.then(run, run)
        // Reactive/scope transitions have no awaiting consumer. Failed work is
        // retained above; standalone explicit unsubscribe keeps its rejection.
        void queue.catch(() => {})
        return queue
      },
      retainTeardown(retry) {
        owner.teardown = retry
        owners.add(owner)
      },
    }
  }
}
