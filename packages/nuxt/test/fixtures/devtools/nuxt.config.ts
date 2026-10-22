import { runtimeSourceAliases } from '../../../../../test/utils/sourceAliases'
import Rstore from '../../../src/module'

export default defineNuxtConfig({
  modules: [Rstore],
  devtools: { enabled: false },
  rstore: { devtools: { base: '/inspect', readOnly: true } },
  alias: runtimeSourceAliases,
})
