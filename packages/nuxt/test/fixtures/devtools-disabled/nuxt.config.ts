/** Dev subprocess reloads disk config, so opt-out belongs in actual fixture layer. */
export default defineNuxtConfig({
  extends: ['../devtools-exclusion'],
  rstore: { devtools: false },
})
