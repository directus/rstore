import type { Plugin } from '../types/plugin.js'
import type { Awaitable } from '../types/utils.js'

type HookCallback<TParams extends (any[] | never), TReturn> = (...arguments_: TParams) => Awaitable<TReturn>

interface StoredHookCallback<TParams extends (any[] | never), TReturn> {
  callback: HookCallback<TParams, TReturn>
  plugin?: Plugin
}

type HookKeys<T> = keyof T & string

/**
 * The value an asynchronous dispatch of `callback` resolves with.
 *
 * `callHook` awaits each callback, so a promised callback result is flattened
 * to the value it fulfils with; `undefined` covers dispatches where no callback
 * returned a non-nullish value. `callHookSync` never awaits and keeps the raw
 * `ReturnType` instead.
 */
type HookDispatchResult<TCallback extends HookCallback<any, any>> = Awaited<ReturnType<TCallback>> | undefined

/**
 * Stops the dispatch it is passed to, and carries the signal that does it.
 *
 * With `{ explicit: true }`, pass the handle as the last argument of the
 * owning `callHook`. Unrelated dispatches cannot consume that handle.
 * Without that option, it also binds implicitly to the next asynchronous call.
 *
 * Only the handle object `withAbort` returned is dispatch metadata: a hook
 * argument that merely looks like one still reaches the callbacks.
 */
export interface AbortHandle {
  (): void
  /** The signal the owning dispatch checks between callbacks. */
  readonly signal: AbortSignal
}

/** Choose whether a handle is implicitly attached to the next dispatch. */
export interface AbortOptions {
  /** Require a trailing callHook argument, leaving unrelated dispatches alone. */
  explicit?: boolean
}

/**
 * The signal of every handle {@link Hookable.withAbort} has created.
 *
 * Recognition is by identity, not by shape: a hook payload may legitimately be
 * a callback carrying a `signal`, and a structural test would both swallow it
 * and read a property that can have side effects.
 */
const abortHandleSignals = new WeakMap<object, AbortSignal>()

/** The signal of `value` when it is a real {@link AbortHandle}, else `undefined`. */
function getAbortHandleSignal(value: unknown): AbortSignal | undefined {
  // Only functions are ever registered; the guard keeps primitives out of the
  // lookup and makes the intent of the check explicit.
  return typeof value === 'function' ? abortHandleSignals.get(value) : undefined
}

/**
 * Split the trailing {@link AbortHandle} — if there is one — off the arguments
 * meant for the callbacks.
 */
function splitAbortHandle(args: any[]): { args: any[], signal: AbortSignal | undefined } {
  const signal = getAbortHandleSignal(args.at(-1))
  return signal
    ? { args: args.slice(0, -1), signal }
    : { args, signal: undefined }
}

export class Hookable<
  HooksT extends Record<string, HookCallback<any, any>> = Record<string, HookCallback<any, any>>,
  HookNameT extends HookKeys<HooksT> = HookKeys<HooksT>,
> {
  public _hooks: { [key: string]: StoredHookCallback<any, any>[] } = {}
  /** Legacy withAbort() applies to the next asynchronous dispatch only. */
  private _nextAbortSignal: AbortSignal | undefined

  constructor() {
    this.hook = this.hook.bind(this)
    this.callHook = this.callHook.bind(this)
    this.callHookSync = this.callHookSync.bind(this)
    // this.callHookWith = this.callHookWith.bind(this)
  }

  hook<HookName extends HookNameT>(name: HookName, callback: HooksT[HookName], plugin?: Plugin): () => void {
    if (!this._hooks[name]) {
      this._hooks[name] = []
    }
    this._hooks[name].push({
      callback,
      plugin,
    })
    return () => {
      if (this._hooks[name]) {
        this._hooks[name] = this._hooks[name].filter(cb => cb.callback !== callback)
      }
    }
  }

  /**
   * Create a handle that stops one dispatch.
   *
   * By default it applies to the next `callHook`, preserving the original API.
   * Use `{ explicit: true }` and pass it as the last argument of the owning
   * `callHook` to keep intervening dispatches independent.
   */
  withAbort(options: AbortOptions = {}): AbortHandle {
    const controller = new AbortController()
    if (!options.explicit) {
      this._nextAbortSignal = controller.signal
    }
    const abort = () => {
      controller.abort()
    }
    const handle = Object.defineProperty(abort, 'signal', {
      value: controller.signal,
      enumerable: false,
    }) as AbortHandle
    abortHandleSignals.set(handle, controller.signal)
    return handle
  }

  // Overloaded rather than a single variadic tuple: spreading
  // `Parameters<...>` into a tuple with an optional tail loses the contextual
  // type of the payload, so callbacks inside it (`setResult`, `getResult`)
  // would fall back to `any`.
  callHook<const HookName extends HookNameT>(
    name: HookName,
    ...args: Parameters<HooksT[HookName]>
  ): Promise<HookDispatchResult<HooksT[HookName]>>
  callHook<const HookName extends HookNameT>(
    name: HookName,
    ...args: [...Parameters<HooksT[HookName]>, AbortHandle]
  ): Promise<HookDispatchResult<HooksT[HookName]>>
  callHook<const HookName extends HookNameT>(
    name: HookName,
    ...args: any[]
  ): Promise<HookDispatchResult<HooksT[HookName]>> {
    const { args: callbackArgs, signal } = splitAbortHandle(args)
    const abortSignal = signal ?? this._nextAbortSignal
    // Consume before callbacks begin so nested calls cannot inherit it.
    this._nextAbortSignal = undefined
    // eslint-disable-next-line no-async-promise-executor
    const promise = new Promise<HookDispatchResult<HooksT[HookName]>>(async (resolve, reject) => {
      try {
        let returned: any
        for (const { callback } of this._hooks[name] ?? []) {
          if (abortSignal?.aborted) {
            break
          }
          const result = await callback(...callbackArgs)
          if (result != null) {
            returned = result
          }
        }
        resolve(returned)
      }
      catch (error) {
        reject(error)
      }
    }) as Promise<HookDispatchResult<HooksT[HookName]>> & { abort: () => void }
    return promise
  }

  callHookSync<HookName extends HookNameT>(name: HookName, ...args: Parameters<HooksT[HookName]>): ReturnType<HooksT[HookName]> | undefined {
    let returned: any
    for (const { callback } of this._hooks[name] ?? []) {
      const result = callback(...args as any[])
      if (result != null) {
        returned = result
      }
    }
    return returned
  }

  callHookWith<
    NameT extends HookNameT,
    CallFunction extends (hooks: Array<{ callback: HooksT[NameT] }>) => any,
  >(
    name: NameT,
    caller: CallFunction,
  ): ReturnType<CallFunction> {
    const result = caller(name in this._hooks ? [...this._hooks[name]!] : [] as any[])
    return result
  }
}

/**
 * Create a raw hookable instance for an arbitrary hook map.
 *
 * Use this for custom hook systems; for store hooks prefer the typed
 * `createHooks` from `./hooks.js` which binds the rstore hook definitions.
 */
export function createHookable<T extends Record<string, any>>(): Hookable<T> {
  return new Hookable<T>()
}
