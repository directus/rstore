import MyModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    MyModule,
  ],
  rstoreMonospace: {
    input: './openapi/schema.json',
    metadataInput: './openapi/schema-metadata.json',
    project: 'blog',
    url: 'https://example.monospace.io',
  },
})
