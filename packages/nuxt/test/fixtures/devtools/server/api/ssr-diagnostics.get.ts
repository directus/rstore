import { getRstoreSSRDiagnostics } from '../../../../../src/runtime/devtools/server'

/** Test fixture reads safe detached records after actual Nitro response lifecycle. */
export default defineEventHandler(() => {
  const config = useRuntimeConfig().rstoreDevtoolsSSR as { baseURL?: string, authToken?: string } | undefined
  const diagnostics = getRstoreSSRDiagnostics()
  return {
    ...diagnostics,
    privateConfigured: !!(config?.baseURL && config.authToken),
    credentialRetained: !!config?.authToken && JSON.stringify(diagnostics).includes(config.authToken),
  }
})
