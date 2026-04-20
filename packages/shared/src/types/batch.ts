/**
 * Store-level batching configuration options.
 *
 * Controls how operations are collected and dispatched as batches.
 */
export interface BatchOptions {
  /**
   * Enable batching for fetch operations.
   * @default true
   */
  fetch?: boolean

  /**
   * Enable batching for mutation operations.
   * @default true
   */
  mutations?: boolean

  /**
   * Delay in milliseconds before flushing the batch queue.
   *
   * - `0` flushes on the next microtask (`queueMicrotask`).
   * - When `maxWait` is **not** set, this is the time-from-first-enqueue before flush.
   * - When `maxWait` is set, this becomes a debounce: the timer resets on every new
   *   enqueue, so the batch only flushes once the queue has been idle for `delay` ms.
   *
   * @default 0
   */
  delay?: number

  /**
   * Hard upper bound (ms) on how long a queued operation can wait before the batch flushes,
   * measured from the first enqueue. Acts as an escape hatch when `delay` is being used as a
   * debounce under sustained activity.
   *
   * Ignored when `delay` is `0`.
   *
   * @default undefined (no hard cap — `delay` alone decides when to flush)
   */
  maxWait?: number

  /**
   * Maximum number of operations to batch together.
   * When reached, the batch is flushed immediately.
   * @default Infinity (no limit)
   */
  maxSize?: number
}

/**
 * Batching configuration shorthand.
 *
 * - `true` enables batching with default options
 * - An object allows fine-grained control
 */
export type BatchingConfig = boolean | BatchOptions

/**
 * Per-call batching options. Passed on individual queries/mutations to
 * customise how that specific op participates in the store's batch scheduler.
 */
export interface BatchCallOptions {
  /**
   * Explicit queue name. Operations sharing the same group are flushed together
   * as a single batch; operations in different groups never mix.
   *
   * Useful when different requests need independent dispatching — for example to
   * keep separate batches per tenant, per auth context, or per endpoint.
   *
   * @default 'default'
   */
  group?: string
}

/**
 * Per-call `batch` setting:
 *
 * - `false` — opt this op out of the batch scheduler entirely
 * - `true` / omitted — join the default group
 * - object — join a specific group (and any future per-call tweaks)
 */
export type BatchCallConfig = boolean | BatchCallOptions
