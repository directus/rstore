import { klona } from 'klona'

/**
 * Call scripting for {@link import('./fakeRemote').createFakeRemote}.
 *
 * Everything a test uses to *control* a fake backend call — recording it,
 * delaying it, holding it open, failing it, or replacing its response — lives
 * here so `fakeRemote.ts` only has to describe the backend itself.
 */

/**
 * Batch hooks the fake remote can register.
 *
 * Off by default: a registered `batch` hook resolves every operation of a
 * group, so it would hide the per-item hooks the other suites assert on.
 */
export type FakeRemoteBatchHook = 'batch' | 'batchFetch' | 'batchMutate'

/** Hooks the fake remote implements, and that tests can script. */
export type FakeRemoteHook
  = | 'fetchFirst'
    | 'fetchMany'
    | 'fetchRelations'
    | 'createItem'
    | 'createMany'
    | 'updateItem'
    | 'updateMany'
    | 'deleteItem'
    | 'deleteMany'
    | 'subscribe'
    | 'unsubscribe'
    | FakeRemoteBatchHook

/**
 * One recorded hook invocation.
 *
 * Read it through {@link CallScript.requests} to assert what the store *asked
 * for*, not only what it stored.
 */
export interface FakeRemoteCall {
  /** The hook that was called. */
  hook: FakeRemoteHook
  /** Name of the collection the call targets. */
  collection: string
  /** Primary key, for single-item hooks. */
  key?: string | number
  /** Primary keys, for `*Many` hooks. */
  keys?: Array<string | number>
  /** Payload item, for `createItem` / `updateItem`. */
  item?: Record<string, any>
  /** Payload items, for `createMany` / `updateMany`. */
  items?: any[]
  /**
   * The find options the store resolved for this call, i.e. after
   * `$resolveFindOptions` merged defaults and ran the `resolveFindOptions`
   * hook. Values are snapshotted at dispatch; callbacks retain their identity.
   */
  findOptions?: any
  /** Subscription id, for `subscribe` / `unsubscribe`. */
  subscriptionId?: string
  /** Batch group name, for the batch hooks. */
  group?: string
  /** Mutation type of the batched operations, for `batchMutate`. */
  mutation?: 'create' | 'update' | 'delete'
}

/**
 * Replaces the value a scripted call produces.
 *
 * @param defaultValue What the backend would have produced on its own: the
 * selected rows for `fetch*`, and the item(s) about to be written for the
 * mutation hooks.
 * @param call The recorded call, for conditional scripting.
 */
export type FakeRemoteResponder = (defaultValue: any, call: FakeRemoteCall) => any

/** Options of {@link CallScript.holdNext}. */
export interface HoldOptions {
  /**
   * How many calls of the hook to hold on the same gate.
   *
   * @default 1
   */
  count?: number
}

/** A pending hold: one promise shared by the calls it still gates. */
interface Hold {
  promise: Promise<void>
  release: () => void
  remaining: number
}

/** The scripting surface a fake backend exposes to a test. */
export interface CallScript {
  /** Every recorded call, in order. Prefer {@link CallScript.requests}. */
  calls: FakeRemoteCall[]
  /**
   * Records a call, reserves its one-shot scripts, then applies hold, latency
   * and failure. Reservations follow entry order, not completion order.
   *
   * Must be awaited before the hook body runs, so a test can observe the
   * in-flight state.
   */
  enter: (hook: FakeRemoteHook, call: Omit<FakeRemoteCall, 'hook'>) => Promise<FakeRemoteCall>
  /** Applies the responder reserved for this call at most once. */
  respond: <T>(defaultValue: T, call: FakeRemoteCall) => T
  /** Recorded calls, newest last, optionally narrowed to a hook/collection. */
  requests: (hook?: FakeRemoteHook, collection?: string) => FakeRemoteCall[]
  /** The most recent recorded call for a hook, if any. */
  lastRequest: (hook: FakeRemoteHook, collection?: string) => FakeRemoteCall | undefined
  /** Number of recorded calls for a hook, optionally narrowed to a collection. */
  callCount: (hook: FakeRemoteHook, collection?: string) => number
  /** Makes the next call of `hook` reject. */
  failNext: (hook: FakeRemoteHook, error?: Error) => void
  /**
   * Holds the next call(s) of `hook` until the returned function is called.
   *
   * @returns Releases every call held by this gate.
   */
  holdNext: (hook: FakeRemoteHook, options?: HoldOptions) => () => void
  /**
   * Delays every subsequent call of `hook` by `ms` milliseconds.
   *
   * Pass `0` to remove the delay.
   */
  latency: (hook: FakeRemoteHook, ms: number) => void
  /** Scripts the response of the next call of `hook`. */
  respondNext: (hook: FakeRemoteHook, fn: FakeRemoteResponder) => void
}

/** Creates the recording + scripting state shared by all fake remote hooks. */
export function createCallScript(): CallScript {
  const calls: FakeRemoteCall[] = []
  const failures = new Map<FakeRemoteHook, Error>()
  const holds = new Map<FakeRemoteHook, Hold>()
  const latencies = new Map<FakeRemoteHook, number>()
  const responders = new Map<FakeRemoteHook, FakeRemoteResponder>()
  const reservedResponders = new WeakMap<FakeRemoteCall, FakeRemoteResponder>()

  /** Matches a recorded call against an optional hook/collection filter. */
  function matches(call: FakeRemoteCall, hook?: FakeRemoteHook, collection?: string) {
    return (!hook || call.hook === hook) && (!collection || call.collection === collection)
  }

  return {
    calls,

    async enter(hook, call) {
      // Keep wire evidence independent of later parsing, edits and hook work.
      // klona also preserves function options, which structuredClone rejects.
      const recorded: FakeRemoteCall = { hook, ...klona(call) }
      calls.push(recorded)

      // Consume before awaiting: a faster sibling must not steal these scripts.
      // Failed calls consume their response too, without invoking it.
      const failure = failures.get(hook)
      failures.delete(hook)
      const responder = responders.get(hook)
      responders.delete(hook)
      if (responder && !failure) {
        reservedResponders.set(recorded, responder)
      }
      const latency = latencies.get(hook)

      // Explicit gate first: a held call must be observable as in-flight
      // before any simulated network delay starts running it down.
      const hold = holds.get(hook)
      if (hold) {
        hold.remaining--
        if (hold.remaining <= 0) {
          holds.delete(hook)
        }
        await hold.promise
      }

      if (latency) {
        await new Promise<void>(resolve => setTimeout(resolve, latency))
      }

      if (failure) {
        throw failure
      }

      return recorded
    },

    respond(defaultValue, call) {
      const responder = reservedResponders.get(call)
      if (!responder) {
        return defaultValue
      }
      reservedResponders.delete(call)
      return responder(defaultValue, call)
    },

    requests: (hook, collection) => calls.filter(call => matches(call, hook, collection)),
    lastRequest: (hook, collection) => calls.filter(call => matches(call, hook, collection)).at(-1),
    callCount: (hook, collection) => calls.filter(call => matches(call, hook, collection)).length,

    failNext: (hook, error = new Error(`fake-remote: ${hook} failed`)) => failures.set(hook, error),

    holdNext: (hook, options) => {
      let release!: () => void
      const promise = new Promise<void>((resolve) => {
        release = resolve
      })
      holds.set(hook, { promise, release, remaining: options?.count ?? 1 })
      return () => release()
    },

    latency: (hook, ms) => {
      if (ms > 0) {
        latencies.set(hook, ms)
      }
      else {
        latencies.delete(hook)
      }
    },

    respondNext: (hook, fn) => responders.set(hook, fn),
  }
}
