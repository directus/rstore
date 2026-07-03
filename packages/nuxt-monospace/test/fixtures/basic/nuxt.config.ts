import MyModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    MyModule,
  ],
  rstoreMonospace: {
    input: './openapi/schema.json',
    project: 'blog',
    url: 'https://example.monospace.io',
  },
})
