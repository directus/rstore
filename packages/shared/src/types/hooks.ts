import type { Awaitable } from './util'

export interface Hooks {
  demo: (hello: string) => Awaitable<string>
}
