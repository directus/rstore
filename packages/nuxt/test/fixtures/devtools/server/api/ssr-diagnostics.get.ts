import { getRstoreSSRDiagnostics } from '../../../../../src/runtime/devtools/server'

/** Test fixture reads safe detached records after actual Nitro response lifecycle. */
export default defineEventHandler(() => {
  const runtimeConfig = useRuntimeConfig()
  const config = runtimeConfig.rstoreDevtoolsSSR as { baseURL?: string, authToken?: string } | undefined
  const diagnostics = getRstoreSSRDiagnostics()
  return {
    ...diagnostics,
    privateConfigured: !!(config?.baseURL && config.authToken),
    nitroModuleConfigPreserved: (runtimeConfig.fixtureNitroModule as { configured?: boolean } | undefined)?.configured === true,
    credentialRetained: !!config?.authToken && JSON.stringify(diagnostics).includes(config.authToken),
  }
})
