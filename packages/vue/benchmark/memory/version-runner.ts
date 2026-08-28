import type { MemoryBenchmarkRunSet } from './types'
import type { MemoryVersionRuns } from './version-report'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { cpus, release, tmpdir, type } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { parseMemoryBenchmarkOutput } from './runner'
import { combineMemoryVersionReports } from './version-report'
import { renderMemoryVersionReportMarkdown } from './version-report-markdown'

const execFileAsync = promisify(execFile)
const LEGACY_HASH = '82162b219cd12e711810bec7856c434a0df47614eb8d8c8309380dc4bbae8fb6'
const VERSION_REVISIONS = {
  dataCoreV1: '30318e8cae55ae623b112865c8ae04c4c6d43242',
  dataCoreV2: 'ffdc11cab53301233881c0512ac5139118779ca9',
  dataCoreV3: '98cc5a7fb6b48f92d3eff4d0b54f23fdd4bf701c',
  dataCoreV4: 'a7baec77dea8601c52ba40cddf93d08d27055274',
} as const
const V4_COMMIT = 'a7baec77dea8601c52ba40cddf93d08d27055274'
const REPORT_PATHS = [
  'packages/vue/benchmark/reports/data-core-memory-v1-v2-v3-v4-v5.json',
  'packages/vue/benchmark/reports/data-core-memory-v1-v2-v3-v4-v5.md',
] as const
const REPORT_DIRECTORY = 'packages/vue/benchmark/reports/'

/** One historical preparation command with deterministic log identity. */
export interface HistoricalPreparationCommand {
  /** Executable resolved through current environment. */
  command: string
  /** Exact non-interactive command arguments. */
  args: string[]
  /** Log filename suffix within controller-owned temporary root. */
  logSuffix: string
}

/** Injectable destructive actions used to verify controller cleanup. */
export interface MemoryControllerCleanupActions {
  /** Remove one exact controller-owned worktree. */
  removeWorktree: (root: string, worktree: string) => Promise<void>
  /** Remove successful controller temporary root and contained logs. */
  removeTemporaryRoot: (temporaryRoot: string) => Promise<void>
}

/** Run exact historical revisions and write retained-memory evidence. */
export async function runMemoryVersionBenchmark(): Promise<void> {
  const root = await gitRoot()
  await validateCandidate(root)
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'rstore-memory-'))
  const logs = join(temporaryRoot, 'logs')
  await mkdir(logs)
  const ownedWorktrees = new Set<string>()
  let succeeded = false
  try {
    const versionRuns = {} as MemoryVersionRuns
    for (const [version, revision] of Object.entries(VERSION_REVISIONS) as Array<[keyof typeof VERSION_REVISIONS, string]>) {
      console.log(`Preparing ${version} at ${revision}`)
      const worktree = join(temporaryRoot, `worktree-${version}`)
      await addWorktree(root, worktree, revision)
      ownedWorktrees.add(worktree)
      await copyMemoryOverlay(root, worktree)
      await assertLegacyHash(worktree)
      for (const command of historicalPreparationCommands()) {
        await runLogged(command.command, command.args, worktree, join(logs, `${version}-${command.logSuffix}`))
      }
      console.log(`Measuring ${version}`)
      versionRuns[version] = await runFullTrials(worktree, join(logs, `${version}-memory.log`))
      await removeWorktree(root, worktree)
      ownedWorktrees.delete(worktree)
    }
    console.log('Preparing dataCoreV5 candidate')
    await assertLegacyHash(root)
    await runLogged('pnpm', ['--filter', '@rstore/shared', 'build'], root, join(logs, 'dataCoreV5-shared-build.log'))
    await runLogged('pnpm', ['--filter', '@rstore/core', 'build'], root, join(logs, 'dataCoreV5-build.log'))
    console.log('Measuring dataCoreV5')
    versionRuns.dataCoreV5 = await runFullTrials(root, join(logs, 'dataCoreV5-memory.log'))
    const report = combineMemoryVersionReports(versionRuns, {
      legacyHash: LEGACY_HASH,
      ...VERSION_REVISIONS,
      dataCoreV5: `working tree based on ${V4_COMMIT}`,
      candidateDiffHash: await candidateDiffHash(root),
    })
    report.environment = {
      ...report.environment,
      cpu: cpus()[0]?.model ?? 'unknown',
      threads: cpus().length,
      os: `${type()} ${release()} ${process.arch}`,
      pnpm: (await exec('pnpm', ['--version'], root)).stdout.trim(),
    }
    await writeArtifacts(root, report)
    succeeded = true
  }
  finally {
    await cleanupMemoryController(root, temporaryRoot, ownedWorktrees, succeeded, {
      removeWorktree,
      removeTemporaryRoot: removeOwnedTemporaryRoot,
    })
    if (!succeeded)
      console.error(`Memory benchmark logs retained at ${temporaryRoot}`)
  }
}

/** Return locked install and serial package build commands for one revision. */
export function historicalPreparationCommands(): HistoricalPreparationCommand[] {
  return [
    { command: 'pnpm', args: ['install', '--frozen-lockfile'], logSuffix: 'install.log' },
    { command: 'pnpm', args: ['--filter', '@rstore/shared', 'build'], logSuffix: 'shared-build.log' },
    { command: 'pnpm', args: ['--filter', '@rstore/core', 'build'], logSuffix: 'build.log' },
  ]
}

/** Remove owned worktrees, preserving failure logs and removing successful roots. */
export async function cleanupMemoryController(
  root: string,
  temporaryRoot: string,
  ownedWorktrees: ReadonlySet<string>,
  succeeded: boolean,
  actions: MemoryControllerCleanupActions,
): Promise<void> {
  for (const worktree of ownedWorktrees)
    await actions.removeWorktree(root, worktree).catch(() => {})
  if (succeeded)
    await actions.removeTemporaryRoot(temporaryRoot)
}

/** Create detached worktree at explicit controller-owned path. */
async function addWorktree(root: string, worktree: string, revision: string): Promise<void> {
  await exec('git', ['worktree', 'add', '--detach', worktree, revision], root)
}

/** Remove exact controller-owned worktree. */
async function removeWorktree(root: string, worktree: string): Promise<void> {
  assertOwnedTemporaryPath(worktree)
  await exec('git', ['worktree', 'remove', '--force', worktree], root)
}

/** Copy benchmark-only memory harness into historical checkout. */
async function copyMemoryOverlay(root: string, worktree: string): Promise<void> {
  const source = join(root, 'packages/vue/benchmark')
  const target = join(worktree, 'packages/vue/benchmark')
  await cp(join(source, 'memory'), join(target, 'memory'), { recursive: true, force: true })
  await cp(join(source, 'memory.ts'), join(target, 'memory.ts'), { force: true })
  await cp(join(source, 'memory-full.ts'), join(target, 'memory-full.ts'), { force: true })
}

/** Run three full trials and parse structured output. */
async function runFullTrials(root: string, logPath: string): Promise<MemoryBenchmarkRunSet['reports']> {
  const viteNode = join(root, 'node_modules/vite-node/vite-node.mjs')
  const entry = join(root, 'packages/vue/benchmark/memory-full.ts')
  const environment: NodeJS.ProcessEnv = { ...process.env, RSTORE_MEMORY_TRIALS: '3' }
  delete environment.RSTORE_MEMORY_SCENARIO
  delete environment.RSTORE_MEMORY_ITEMS
  let result: { stdout: string, stderr: string }
  try {
    result = await exec(process.execPath, [viteNode, entry], join(root, 'packages/vue'), environment)
    await writeFile(logPath, `${result.stdout}${result.stderr}`)
  }
  catch (error: any) {
    await writeFile(logPath, `${error.stdout ?? ''}${error.stderr ?? ''}`)
    throw error
  }
  const reports = parseMemoryBenchmarkOutput(result.stdout)
  if (reports.reports.length !== 3)
    throw new TypeError(`Expected three memory reports from ${root}, received ${reports.reports.length}`)
  return reports.reports
}

/** Run command and retain combined output for failure diagnosis. */
async function runLogged(command: string, args: string[], cwd: string, logPath: string): Promise<void> {
  try {
    const result = await exec(command, args, cwd)
    await writeFile(logPath, `${result.stdout}${result.stderr}`)
  }
  catch (error: any) {
    await writeFile(logPath, `${error.stdout ?? ''}${error.stderr ?? ''}`)
    throw error
  }
}

/** Execute one command with bounded captured output. */
async function exec(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<{ stdout: string, stderr: string }> {
  return execFileAsync(command, args, { cwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/** Resolve repository root through Git. */
async function gitRoot(): Promise<string> {
  return (await exec('git', ['rev-parse', '--show-toplevel'], process.cwd())).stdout.trim()
}

/** Verify current candidate ancestry and frozen fixture identity. */
async function validateCandidate(root: string): Promise<void> {
  const head = (await exec('git', ['rev-parse', 'HEAD'], root)).stdout.trim()
  if (head !== V4_COMMIT)
    throw new TypeError(`Memory v5 runtime must be based on ${V4_COMMIT}, received ${head}`)
}

/** Verify frozen legacy fixture SHA-256. */
async function assertLegacyHash(root: string): Promise<void> {
  const path = join(root, 'packages/vue/benchmark/legacy-cache.ts')
  const hash = createHash('sha256').update(await readFile(path)).digest('hex')
  if (hash !== LEGACY_HASH)
    throw new TypeError(`Frozen legacy hash drift: expected ${LEGACY_HASH}, received ${hash}`)
}

/** Hash tracked candidate diff plus untracked sources, excluding generated outputs. */
async function candidateDiffHash(root: string): Promise<string> {
  const digest = createHash('sha256')
  const diff = await exec('git', ['diff', '--binary', 'HEAD', '--', '.', ...REPORT_PATHS.map(path => `:(exclude)${path}`)], root)
  digest.update(diff.stdout)
  const untracked = (await exec('git', ['ls-files', '--others', '--exclude-standard', '-z'], root)).stdout.split('\0').filter(path => path && !path.startsWith(REPORT_DIRECTORY)).sort()
  for (const path of untracked)
    digest.update(path).update('\0').update(await readFile(resolve(root, path)))
  return digest.digest('hex')
}

/** Write JSON and Markdown only after every version validates. */
async function writeArtifacts(root: string, report: any): Promise<void> {
  await writeFile(join(root, REPORT_PATHS[0]), `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(join(root, REPORT_PATHS[1]), renderMemoryVersionReportMarkdown(report))
  console.log(`Wrote ${REPORT_PATHS[1]}`)
  console.log(`Wrote ${REPORT_PATHS[0]}`)
}

/** Reject cleanup outside exact generated temporary root family. */
export function assertOwnedTemporaryPath(path: string): void {
  const parent = resolve(tmpdir()) + sep
  const resolved = resolve(path)
  if (!resolved.startsWith(parent) || !basename(resolved).startsWith('worktree-dataCore'))
    throw new TypeError(`Refusing to remove non-owned memory worktree: ${path}`)
}

/** Remove successful controller root after validating exact prefix. */
async function removeOwnedTemporaryRoot(path: string): Promise<void> {
  const resolved = resolve(path)
  if (dirname(resolved) !== resolve(tmpdir()) || !basename(resolved).startsWith('rstore-memory-'))
    throw new TypeError(`Refusing to remove non-owned memory temporary root: ${path}`)
  await rm(resolved, { recursive: true, force: true })
}
