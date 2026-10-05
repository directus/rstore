import { fileURLToPath } from 'node:url'

/** Resolves a public workspace entry to current source rather than a dist stub. */
export function sourceEntry(pkg: string, file = 'src/index.ts'): string {
  return fileURLToPath(new URL(`../../packages/${pkg}/${file}`, import.meta.url))
}

/**
 * Real runtime entries shared by Vitest and Nuxt's independently built fixtures.
 *
 * Subpaths come before their package root: Nuxt/Vite object aliases match by
 * prefix in insertion order (Vitest turns each key into an exact match).
 */
export const runtimeSourceAliases = {
  '@rstore/multiplayer/clock': sourceEntry('multiplayer', 'src/clock/index.ts'),
  '@rstore/multiplayer/lww': sourceEntry('multiplayer', 'src/lww/index.ts'),
  '@rstore/multiplayer/text': sourceEntry('multiplayer', 'src/text/index.ts'),
  '@rstore/multiplayer/presence': sourceEntry('multiplayer', 'src/presence/index.ts'),
  '@rstore/multiplayer/protocol': sourceEntry('multiplayer', 'src/protocol/index.ts'),
  '@rstore/multiplayer/ot': sourceEntry('multiplayer', 'src/ot/index.ts'),
  '@rstore/multiplayer/server': sourceEntry('multiplayer', 'src/server/index.ts'),
  '@rstore/multiplayer/prosemirror': sourceEntry('multiplayer', 'src/prosemirror/index.ts'),
  '@rstore/multiplayer': sourceEntry('multiplayer'),
  '@rstore/core': sourceEntry('core'),
  '@rstore/shared': sourceEntry('shared'),
  '@rstore/vue': sourceEntry('vue'),
  '@rstore/connector-toolkit': sourceEntry('connector-toolkit'),
  '@rstore/monospace': sourceEntry('monospace'),
}
