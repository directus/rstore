import type { BatchOptions, CustomHookMeta, FindOptions, ResolvedCollection, StoreCore } from '@rstore/shared'
import type { GroupState } from './group'
import { flushAll } from './flushAll'
import { clearGroupTimers, createGroupState } from './group'

/** Type of batch operation */
export type BatchEntryType = 'fetchFirst' | 'create' | 'update' | 'delete'

/**
 * A single entry in the batch queue, holding the operation details
 * and the deferred promise resolve/reject callbacks.
 */
export interface BatchEntry {
  type: BatchEntryType
  collection: ResolvedCollection
  key?: string | number
  findOptions?: FindOptions<any, any, any>
  item?: any
  meta: CustomHookMeta
  resolve: (result: any) => void
  reject: (error: Error) => void
}

/** Default group name used when the caller doesn't specify one */
export const DEFAULT_GROUP = 'default'

/** Resolved batch options with all defaults applied */
export interface ResolvedBatchOptions {
  fetch: boolean
  mutations: boolean
  delay: number
  maxWait: number | undefined
  maxSize: number
}

/**
 * Resolves user-provided batch options by applying defaults.
 */
export function resolveBatchOptions(options: BatchOptions): ResolvedBatchOptions {
  return {
    fetch: options.fetch ?? true,
    mutations: options.mutations ?? true,
    delay: options.delay ?? 0,
    maxWait: options.maxWait,
    maxSize: options.maxSize ?? Infinity,
  }
}

/**
 * Central batch scheduler that collects operations and dispatches them
 * together through batch hooks. Operations are bucketed into named groups so
 * different groups can flush independently under their own pacing.
 */
export class BatchScheduler {
  /** One queue per group name */
  public groups = new Map<string, GroupState>()

  /** Resolved configuration */
  public options: ResolvedBatchOptions

  /** Reference to the store */
  private store: StoreCore<any, any>

  constructor(store: StoreCore<any, any>, options: BatchOptions) {
    this.store = store
    this.options = resolveBatchOptions(options)
  }

  /** Enqueue a findFirst-by-key operation into the batch. */
  enqueueFetchFirst(
    collection: ResolvedCollection,
    key: string | number,
    findOptions: FindOptions<any, any, any>,
    meta: CustomHookMeta,
    group: string = DEFAULT_GROUP,
  ): Promise<any> {
    return this.enqueue({ type: 'fetchFirst', collection, key, findOptions, meta }, group)
  }

  /** Enqueue a create mutation into the batch. */
  enqueueCreate(
    collection: ResolvedCollection,
    item: any,
    meta: CustomHookMeta,
    group: string = DEFAULT_GROUP,
  ): Promise<any> {
    return this.enqueue({ type: 'create', collection, item, meta }, group)
  }

  /** Enqueue an update mutation into the batch. */
  enqueueUpdate(
    collection: ResolvedCollection,
    key: string | number,
    item: any,
    meta: CustomHookMeta,
    group: string = DEFAULT_GROUP,
  ): Promise<any> {
    return this.enqueue({ type: 'update', collection, key, item, meta }, group)
  }

  /** Enqueue a delete mutation into the batch. */
  enqueueDelete(
    collection: ResolvedCollection,
    key: string | number,
    meta: CustomHookMeta,
    group: string = DEFAULT_GROUP,
  ): Promise<void> {
    return this.enqueue({ type: 'delete', collection, key, meta }, group)
  }

  /** Flush every queued group immediately (e.g. on store teardown). */
  public flush(): void {
    for (const group of [...this.groups.keys()]) {
      this.flushGroup(group)
    }
  }

  /**
   * Internal: enqueue a batch entry and schedule flush for its group.
   */
  private enqueue(
    entry: Omit<BatchEntry, 'resolve' | 'reject'>,
    group: string,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const state = this.getOrCreateGroup(group)
      state.entries.push({ ...entry, resolve, reject })

      // Flush immediately when size cap hits
      if (state.entries.length >= this.options.maxSize) {
        this.flushGroup(group)
        return
      }

      this.scheduleFlush(group, state)
    })
  }

  /** Fetch or lazily initialise a group's queue state. */
  private getOrCreateGroup(group: string): GroupState {
    let state = this.groups.get(group)
    if (!state) {
      state = createGroupState()
      this.groups.set(group, state)
    }
    return state
  }

  /**
   * Schedule a flush for a group based on the resolved timing options.
   *
   * - `delay === 0` → microtask flush (single queueMicrotask per group)
   * - `delay > 0` + no `maxWait` → single setTimeout from first enqueue
   * - `delay > 0` + `maxWait` → debounce: reset timer each enqueue, plus
   *   a hard-cap `maxWait` timer armed on the first enqueue
   */
  private scheduleFlush(group: string, state: GroupState): void {
    const { delay, maxWait } = this.options

    if (delay === 0) {
      if (!state.microtaskScheduled) {
        state.microtaskScheduled = true
        queueMicrotask(() => this.flushGroup(group))
      }
      return
    }

    if (maxWait != null) {
      // Debounce the flush timer
      if (state.flushTimer != null) {
        clearTimeout(state.flushTimer)
      }
      state.flushTimer = setTimeout(() => this.flushGroup(group), delay)

      // Arm the max-wait timer only on the first enqueue for this cycle
      if (state.maxWaitTimer == null) {
        state.maxWaitTimer = setTimeout(() => this.flushGroup(group), maxWait)
      }
      return
    }

    // Legacy behaviour: single setTimeout from first enqueue
    if (state.flushTimer == null) {
      state.flushTimer = setTimeout(() => this.flushGroup(group), delay)
    }
  }

  /**
   * Drain a single group's queue and dispatch its entries.
   */
  private flushGroup(group: string): void {
    const state = this.groups.get(group)
    if (!state) {
      return
    }
    clearGroupTimers(state)
    const entries = state.entries.splice(0)
    if (entries.length === 0) {
      return
    }
    // flushAll handles the hook cascade (batch → batchFetch/batchMutate → individual)
    flushAll(this.store, entries, group)
  }
}

/**
 * Create a new BatchScheduler instance for the given store.
 */
export function createBatchScheduler(
  store: StoreCore<any, any>,
  options: BatchOptions,
): BatchScheduler {
  return new BatchScheduler(store, options)
}
