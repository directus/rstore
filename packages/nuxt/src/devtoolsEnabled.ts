interface NuxtDevtoolsOptions {
  enabled?: boolean
}

export function resolveNuxtDevtoolsEnabled(devtools: boolean | NuxtDevtoolsOptions | null | undefined) {
  if (devtools === false) {
    return false
  }

  if (typeof devtools === 'object' && devtools && typeof devtools.enabled === 'boolean') {
    return devtools.enabled
  }

  return true
}
