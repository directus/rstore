import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
// @ts-expect-error untyped release script
import { getReadmeTargets } from '../scripts/copy-readme.mjs'

/** README of a package folder (`undefined` when missing), or of the root with `''`. */
function readme(name: string): string | undefined {
  const url = new URL(name ? `../packages/${name}/README.md` : '../README.md', import.meta.url)
  return existsSync(url) ? readFileSync(url, 'utf8') : undefined
}

it('never overwrites a package README that documents the package itself', () => {
  const targets: string[] = getReadmeTargets()
  const ownReadmes = readdirSync(new URL('../packages/', import.meta.url))
    .filter(name => readme(name) !== undefined && readme(name) !== readme(''))

  expect(targets).toContain('vue')
  expect(ownReadmes).toContain('multiplayer')
  expect(targets.filter(name => ownReadmes.includes(name))).toEqual([])
})
