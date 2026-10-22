import { normalizeRstoreBase } from '@rstore/devtools/vite'

/** Development inspector configuration exposed by the Nuxt module. */
export interface RstoreNuxtDevtoolsOptions {
  /** Inspector mount relative to Nuxt application base. */
  base?: string
  /** Reject every devtools action while preserving inspection. */
  readOnly?: boolean
}

/** Resolved browser configuration contains no private server credentials. */
export interface ResolvedNuxtDevtoolsOptions {
  /** Canonical inspector mount with leading and trailing slash. */
  base: string
  /** Registration action policy. */
  readOnly: boolean
}

/** Production always excludes instrumentation, including explicit enabled options. */
export function resolveDevtoolsOptions(value: boolean | RstoreNuxtDevtoolsOptions | undefined, dev: boolean): ResolvedNuxtDevtoolsOptions | false {
  if (!dev || value === false)
    return false
  const options = typeof value === 'object' ? value : {}
  return { base: normalizeRstoreBase(options.base), readOnly: options.readOnly ?? false }
}
