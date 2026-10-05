import { defineBuildConfig } from 'unbuild'

/**
 * One entry per public subpath, so each one is tree-shaken independently
 * (`@rstore/multiplayer/clock` never pulls the protocol guards, and so on).
 */
export default defineBuildConfig({
  entries: [
    'src/index',
    'src/clock/index',
    'src/lww/index',
    'src/text/index',
    'src/presence/index',
    'src/protocol/index',
    'src/ot/index',
    'src/server/index',
    'src/prosemirror/index',
  ],
  declaration: true,
  sourcemap: true,
  rollup: {
    emitCJS: true,
  },
})
