import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as deprecatedCore from '../../packages/core/src/deprecated/multiplayer'
// @ts-expect-error untyped build script
import { coreMoves, generateMultiplayerCodemod } from '../../scripts/codemods/generate-multiplayer-0.9.mjs'

const codemodDir = fileURLToPath(new URL('../../scripts/codemods/', import.meta.url))
const fixturesDir = join(codemodDir, '__fixtures__')
const astGrep = fileURLToPath(new URL('../../node_modules/.bin/ast-grep', import.meta.url))

/** Run the codemod on a temp copy of the `*.input.ts` fixtures and return the rewritten files. */
function runCodemod(): Record<string, string> {
  const dir = mkdtempSync(join(tmpdir(), 'rstore-codemod-'))
  try {
    const inputs = readdirSync(fixturesDir).filter(file => file.endsWith('.input.ts'))
    for (const file of inputs)
      cpSync(join(fixturesDir, file), join(dir, file.replace('.input.ts', '.ts')))
    execFileSync(astGrep, ['scan', '-r', join(codemodDir, 'multiplayer-0.9.yml'), '--update-all', dir], { stdio: 'pipe' })
    return Object.fromEntries(inputs.map((file) => {
      const name = file.replace('.input.ts', '')
      return [name, readFileSync(join(dir, `${name}.ts`), 'utf8')]
    }))
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('multiplayer 0.9 codemod', () => {
  it('rewrites every fixture to its expected output', () => {
    const results = runCodemod()

    expect(Object.keys(results).length).toBeGreaterThan(0)
    for (const [name, content] of Object.entries(results))
      expect(content, name).toBe(readFileSync(join(fixturesDir, `${name}.output.ts`), 'utf8'))
  })

  it('moves every name @rstore/core still re-exports as deprecated', () => {
    const moved = new Set(coreMoves.flatMap(([, , names]: [string, string, string[]]) => names))
    expect(Object.keys(deprecatedCore).filter(name => !moved.has(name))).toEqual([])
  })

  it('is generated from the current generator', () => {
    expect(readFileSync(join(codemodDir, 'multiplayer-0.9.yml'), 'utf8')).toBe(generateMultiplayerCodemod())
  })
})
