import { copyFileSync, readdirSync } from 'node:fs'
/**
 * Copies the root README into every package before a release (npm shows the
 * package README), except the packages that have their own.
 *
 *   node scripts/copy-readme.mjs
 */
import process from 'node:process'

/** Packages whose README documents the package itself. */
export const ownReadmePackages = [
  'multiplayer',
  'nuxt-multiplayer',
  'nuxt-multiplayer-server',
  'playground-ws-server',
]

const root = new URL('../', import.meta.url)

/** Package folders that receive the root README. */
export function getReadmeTargets() {
  return readdirSync(new URL('packages/', root), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !ownReadmePackages.includes(entry.name))
    .map(entry => entry.name)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const name of getReadmeTargets())
    copyFileSync(new URL('README.md', root), new URL(`packages/${name}/README.md`, root))
}
