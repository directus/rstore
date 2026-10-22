import type { Plugin } from 'vite'
import type { RstoreDevtoolsViteOptions } from './vite/options'
import { configureDevtoolsServer } from './vite/server'

export { normalizeRstoreBase } from './devframe/paths'
export type { RstoreDevtoolsViteOptions } from './vite/options'
export { configureDevtoolsServer } from './vite/server'

/** Host inspector and authenticated relay only on development Vite servers. */
export function rstoreDevtools(options: RstoreDevtoolsViteOptions = {}): Plugin {
  return {
    name: 'rstore-devtools',
    apply: 'serve',
    async configureServer(server) { await configureDevtoolsServer(server, options) },
  }
}
