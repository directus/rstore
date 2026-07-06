import RstoreMonospace from '../src/module'

export default defineNuxtConfig({
  modules: [
    RstoreMonospace,
  ],
  rstoreMonospace: {
    input: './openapi/schema.json',
    metadataInput: './openapi/schema-metadata.json',
    project: 'blog',
    url: 'https://example.monospace.io',
  },
})
