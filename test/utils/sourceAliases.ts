import { fileURLToPath } from 'node:url'

/** Resolves a public workspace entry to current source rather than a dist stub. */
export function sourceEntry(pkg: string, file = 'src/index.ts'): string {
  return fileURLToPath(new URL(`../../packages/${pkg}/${file}`, import.meta.url))
}

/** Real runtime entries shared by Vitest and Nuxt's independently built fixtures. */
export const runtimeSourceAliases = {
  '@rstore/core': sourceEntry('core'),
  '@rstore/shared': sourceEntry('shared'),
  '@rstore/vue': sourceEntry('vue'),
  '@rstore/connector-toolkit': sourceEntry('connector-toolkit'),
  '@rstore/monospace': sourceEntry('monospace'),
}
