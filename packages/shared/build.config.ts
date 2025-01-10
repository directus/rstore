import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  sourcemap: true,
  // entries: [
  //   {
  //     input: './src',
  //     builder: 'mkdist',
  //     outDir: './dist',
  //     declaration: true,
  //     format: 'esm',
  //     ext: 'mjs',
  //   },
  //   {
  //     input: './src',
  //     builder: 'mkdist',
  //     outDir: './dist',
  //     format: 'cjs',
  //     ext: 'cjs',
  //   },
  // ],
})
