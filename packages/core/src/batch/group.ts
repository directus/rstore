import type { BatchEntry } from './scheduler'

/**
 * Per-group queue state. Each named group has its own entries and timers so
 * different groups can flush independently under their own pacing.
 */
export interface GroupState {
  /** Queued entries waiting to flush */
  entries: BatchEntry[]
  /** Debounce timer (or microtask guard for delay=0) */
  flushTimer?: ReturnType<typeof setTimeout>
  /** Hard-cap maxWait timer, armed on first enqueue */
  maxWaitTimer?: ReturnType<typeof setTimeout>
  /** Set while a microtask flush is pending to avoid double-scheduling */
  microtaskScheduled: boolean
}

/**
 * Create an empty group state record.
 */
export function createGroupState(): GroupState {
  return {
    entries: [],
    microtaskScheduled: false,
  }
}

/**
 * Clear any pending timers on the group so it can be re-scheduled or torn down.
 */
export function clearGroupTimers(state: GroupState): void {
  if (state.flushTimer != null) {
    clearTimeout(state.flushTimer)
    state.flushTimer = undefined
  }
  if (state.maxWaitTimer != null) {
    clearTimeout(state.maxWaitTimer)
    state.maxWaitTimer = undefined
  }
  state.microtaskScheduled = false
}
