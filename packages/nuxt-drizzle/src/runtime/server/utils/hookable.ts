import type { Awaitable } from '@rstore/shared'

type HookCallback<TParams extends (any[] | never), TReturn> = (...arguments_: TParams) => Awaitable<TReturn>

interface StoredHookCallback<TParams extends (any[] | never), TReturn> {
  callback: HookCallback<TParams, TReturn>
  plugin?: Plugin
}

type HookKeys<T> = keyof T & string

export class Hookable<
  HooksT extends Record<string, HookCallback<any, any>> = Record<string, HookCallback<any, any>>,
  HookNameT extends HookKeys<HooksT> = HookKeys<HooksT>,
> {
  public _hooks: { [key: string]: StoredHookCallback<any, any>[] } = {}

  constructor() {
    this.hook = this.hook.bind(this)
    this.callHook = this.callHook.bind(this)
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

  callHook<const HookName extends HookNameT>(name: HookName, ...args: Parameters<HooksT[HookName]>): Promise<ReturnType<Awaited<HooksT[HookName]>> | undefined> {
    // eslint-disable-next-line no-async-promise-executor
    const promise = new Promise<ReturnType<Awaited<HooksT[HookName]>> | undefined>(async (resolve, reject) => {
      try {
        let returned: any
        for (const { callback } of this._hooks[name] ?? []) {
          const result = await callback(...args as any[])
          if (result != null) {
            returned = result
          }
        }
        resolve(returned)
      }
      catch (error) {
        reject(error)
      }
    }) as Promise<ReturnType<Awaited<HooksT[HookName]>> | undefined> & { abort: () => void }
    return promise
  }
}

export function createHooks<T extends Record<string, any>>(): Hookable<T> {
  return new Hookable<T>()
}
