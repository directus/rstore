import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  sourcemap: true,
  entries: [
    'src/index',
    'src/browser/index',
    'src/vue/index',
    'src/node/index',
    'src/vite',
    'src/protocol/index',
    'src/cli/index',
  ],
  declaration: true,
  // Keep host framework declarations external instead of bundling Vite internals.
  externals: ['vite'],
})
