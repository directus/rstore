import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/index',
    'src/schema/index',
  ],
  declaration: true,
  sourcemap: true,
})
