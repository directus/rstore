import { runtimeSourceAliases } from '../../../../../test/utils/sourceAliases'
import MyModule from '../../../src/module'

export default defineNuxtConfig({
  // `pnpm install` creates Jiti-backed dist stubs that Nitro cannot bundle.
  // Exercise the runtime source in both SSR and client builds instead.
  alias: runtimeSourceAliases,
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
