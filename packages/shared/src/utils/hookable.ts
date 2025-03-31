import type { Plugin } from '../types/plugin.js'
import type { Awaitable } from '../types/utils.js'

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
      this._hooks[name] = this._hooks[name].filter(cb => cb.callback !== callback)
    }
  }

  async callHook<HookName extends HookNameT>(name: HookName, ...args: Parameters<HooksT[HookName]>): Promise<ReturnType<HooksT[HookName]> | undefined> {
    let returned: any
    for (const { callback } of this._hooks[name] ?? []) {
      const result = await callback(...args as any[])
      if (result != null) {
        returned = result
      }
    }
    return returned
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

  // callHookWith<
  //   NameT extends HookNameT,
  //   CallFunction extends (hooks: HooksT[NameT][]) => any,
  // >(
  //   caller: CallFunction,
  //   name: NameT,
  // ): ReturnType<CallFunction> {
  //   const result = caller(name in this._hooks ? [...this._hooks[name]] : [] as any[])
  //   return result
  // }
}

export function createHooks<T extends Record<string, any>>(): Hookable<T> {
  return new Hookable<T>()
}
