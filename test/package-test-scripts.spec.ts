import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

/** Runs the consumer-facing package script in a separate process. */
const execute = promisify(execFile)
/** Workspace root, independent of the directory invoking Vitest. */
const root = fileURLToPath(new URL('..', import.meta.url))

it.each([
  { packageName: 'connector-toolkit', filename: 'codegen.test.ts', outside: 'collection.spec.ts' },
  { packageName: 'nuxt', filename: 'basic.test.ts', outside: 'query-bounds.test.ts' },
])('$packageName scripts narrow filename filters and reject other packages', { timeout: 30_000 }, async ({ packageName, filename, outside }) => {
  const directory = await mkdtemp(join(tmpdir(), 'rstore-package-tests-'))
  try {
    const report = join(directory, 'results.json')
    await execute('pnpm', [
      '--filter',
      `@rstore/${packageName}`,
      'test',
      filename,
      '--reporter=json',
      `--outputFile=${report}`,
    ], { cwd: root })
    const results = JSON.parse(await readFile(report, 'utf8'))
    expect([...new Set(results.testResults.map((result: { name: string }) => result.name))]).toEqual([
      join(root, `packages/${packageName}/test/${filename}`),
    ])

    const outsideReport = join(directory, 'outside.json')
    await execute('pnpm', [
      '--filter',
      `@rstore/${packageName}`,
      'test',
      outside,
      '--passWithNoTests',
      '--reporter=json',
      `--outputFile=${outsideReport}`,
    ], { cwd: root })
    expect(JSON.parse(await readFile(outsideReport, 'utf8')).testResults).toEqual([])
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})
