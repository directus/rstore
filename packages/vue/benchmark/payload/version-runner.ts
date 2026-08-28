import type { PayloadVersionRuns } from './version-report'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { cpus, release, tmpdir, type } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { combineMemoryV6Reports } from '../memory/version-report-v6'
import { renderMemoryV6Markdown } from '../memory/version-report-v6-markdown'
import { combineV6VersionReports } from '../version-report-v6'
import { renderV6VersionReportMarkdown } from '../version-report-v6-markdown'
import { combinePayloadVersionReports } from './version-report'
import { renderPayloadVersionReportMarkdown } from './version-report-markdown'
import { runInterleavedVersionTrials } from './version-trials'

const execFileAsync = promisify(execFile)
const LEGACY_HASH = '82162b219cd12e711810bec7856c434a0df47614eb8d8c8309380dc4bbae8fb6'
const V5_COMMIT = '94768489abd6d53b883957b3f1b6ce22d66cffc3'
const REPORT_PATHS = [
  'packages/vue/benchmark/reports/data-core-big-payload-v5-v6.json',
  'packages/vue/benchmark/reports/data-core-big-payload-v5-v6.md',
  'packages/vue/benchmark/reports/data-core-memory-v5-v6.json',
  'packages/vue/benchmark/reports/data-core-memory-v5-v6.md',
  'packages/vue/benchmark/reports/data-core-v5-v6.json',
  'packages/vue/benchmark/reports/data-core-v5-v6.md',
] as const
const REPORT_DIRECTORY = 'packages/vue/benchmark/reports/'

/** One historical preparation command. */
export interface PayloadPreparationCommand {
  /** Executable. */
  command: string
  /** Exact arguments. */
  args: string[]
  /** Log suffix. */
  logSuffix: string
}

/** Injectable cleanup actions used by controller tests. */
export interface PayloadCleanupActions {
  /** Remove exact owned worktree. */
  removeWorktree: (root: string, worktree: string) => Promise<void>
  /** Remove successful owned temporary root. */
  removeTemporaryRoot: (temporaryRoot: string) => Promise<void>
}

/** Run exact v5 and current v6 payload evidence on same machine. */
export async function runPayloadVersionBenchmark(): Promise<void> {
  const root = await gitRoot()
  await validateCandidate(root)
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'rstore-payload-'))
  const logs = join(temporaryRoot, 'logs')
  await mkdir(logs)
  const worktree = join(temporaryRoot, 'worktree-dataCoreV5')
  const owned = new Set<string>()
  let succeeded = false
  try {
    await addWorktree(root, worktree, V5_COMMIT)
    owned.add(worktree)
    await copyPayloadOverlay(root, worktree)
    await assertLegacyHash(worktree)
    for (const command of payloadPreparationCommands())
      await runLogged(command.command, command.args, worktree, join(logs, `v5-${command.logSuffix}`))
    await assertLegacyHash(root)
    for (const command of payloadPreparationCommands().slice(1))
      await runLogged(command.command, command.args, root, join(logs, `v6-${command.logSuffix}`))
    const trials = await runInterleavedVersionTrials(worktree, root, logs)
    const { cpuV5, cpuV6, memoryV5, memoryV6, payloadV5: dataCoreV5, payloadV6: dataCoreV6 } = trials
    const versionRuns: PayloadVersionRuns = { dataCoreV5, dataCoreV6 }
    const candidateHash = await candidateDiffHash(root)
    const labels = {
      legacyHash: LEGACY_HASH,
      dataCoreV5: V5_COMMIT,
      dataCoreV6: `working tree based on ${V5_COMMIT}`,
      candidateDiffHash: candidateHash,
    }
    const environment = {
      cpu: cpus()[0]?.model ?? 'unknown',
      threads: cpus().length,
      os: `${type()} ${release()} ${process.arch}`,
      pnpm: (await exec('pnpm', ['--version'], root)).stdout.trim(),
    }
    const reports = {
      payload: combinePayloadVersionReports(versionRuns, labels),
      memory: combineMemoryV6Reports(memoryV5, memoryV6, labels),
      cpu: combineV6VersionReports(cpuV5, cpuV6, labels),
    }
    for (const report of Object.values(reports))
      report.environment = { ...report.environment, ...environment }
    await writeArtifacts(root, reports)
    await removeWorktree(root, worktree)
    owned.delete(worktree)
    succeeded = true
  }
  finally {
    await cleanupPayloadController(root, temporaryRoot, owned, succeeded, {
      removeWorktree,
      removeTemporaryRoot: removeOwnedTemporaryRoot,
    })
    if (!succeeded)
      console.error(`Payload benchmark logs retained at ${temporaryRoot}`)
  }
}

/** Return locked install and serial build commands. */
export function payloadPreparationCommands(): PayloadPreparationCommand[] {
  return [
    { command: 'pnpm', args: ['install', '--frozen-lockfile'], logSuffix: 'install.log' },
    { command: 'pnpm', args: ['--filter', '@rstore/shared', 'build'], logSuffix: 'shared-build.log' },
    { command: 'pnpm', args: ['--filter', '@rstore/core', 'build'], logSuffix: 'core-build.log' },
  ]
}

/** Remove owned worktrees and preserve failure logs. */
export async function cleanupPayloadController(
  root: string,
  temporaryRoot: string,
  worktrees: ReadonlySet<string>,
  succeeded: boolean,
  actions: PayloadCleanupActions,
): Promise<void> {
  for (const worktree of worktrees)
    await actions.removeWorktree(root, worktree).catch(() => {})
  if (succeeded)
    await actions.removeTemporaryRoot(temporaryRoot)
}

/** Reject worktree cleanup outside generated temporary paths. */
export function assertOwnedPayloadPath(path: string): void {
  const resolved = resolve(path)
  if (!resolved.startsWith(resolve(tmpdir()) + sep) || basename(resolved) !== 'worktree-dataCoreV5')
    throw new TypeError(`Refusing to remove non-owned payload worktree: ${path}`)
}

/** Create detached exact-v5 worktree. */
async function addWorktree(root: string, worktree: string, revision: string): Promise<void> {
  await exec('git', ['worktree', 'add', '--detach', worktree, revision], root)
}

/** Remove one exact owned detached worktree. */
async function removeWorktree(root: string, worktree: string): Promise<void> {
  assertOwnedPayloadPath(worktree)
  await exec('git', ['worktree', 'remove', '--force', worktree], root)
}

/** Copy benchmark-only payload overlay into historical checkout. */
async function copyPayloadOverlay(root: string, worktree: string): Promise<void> {
  const source = join(root, 'packages/vue/benchmark')
  const target = join(worktree, 'packages/vue/benchmark')
  await cp(join(source, 'payload'), join(target, 'payload'), { recursive: true, force: true })
  await cp(join(source, 'payload.ts'), join(target, 'payload.ts'), { force: true })
  await cp(join(source, 'payload-full.ts'), join(target, 'payload-full.ts'), { force: true })
}

/** Run command and retain output on failure. */
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

/** Execute one bounded child command. */
async function exec(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<{ stdout: string, stderr: string }> {
  return execFileAsync(command, args, { cwd, env, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
}

/** Resolve Git repository root. */
async function gitRoot(): Promise<string> {
  return (await exec('git', ['rev-parse', '--show-toplevel'], process.cwd())).stdout.trim()
}

/** Require candidate based on exact v5 commit. */
async function validateCandidate(root: string): Promise<void> {
  const head = (await exec('git', ['rev-parse', 'HEAD'], root)).stdout.trim()
  if (head !== V5_COMMIT)
    throw new TypeError(`Data Core v6 must be based on ${V5_COMMIT}, received ${head}`)
}

/** Verify frozen legacy fixture identity. */
async function assertLegacyHash(root: string): Promise<void> {
  const hash = createHash('sha256').update(await readFile(join(root, 'packages/vue/benchmark/legacy-cache.ts'))).digest('hex')
  if (hash !== LEGACY_HASH)
    throw new TypeError(`Frozen legacy hash drift: expected ${LEGACY_HASH}, received ${hash}`)
}

/** Hash candidate diff and untracked sources excluding generated reports. */
async function candidateDiffHash(root: string): Promise<string> {
  const digest = createHash('sha256')
  const diff = await exec('git', ['diff', '--binary', 'HEAD', '--', '.', ...REPORT_PATHS.map(path => `:(exclude)${path}`)], root)
  digest.update(diff.stdout)
  const untracked = (await exec('git', ['ls-files', '--others', '--exclude-standard', '-z'], root)).stdout.split('\0').filter(path => path && !path.startsWith(REPORT_DIRECTORY)).sort()
  for (const path of untracked)
    digest.update(path).update('\0').update(await readFile(resolve(root, path)))
  return digest.digest('hex')
}

/** Write payload JSON and Markdown evidence. */
async function writeArtifacts(root: string, reports: { payload: any, memory: any, cpu: any }): Promise<void> {
  await writeFile(join(root, REPORT_PATHS[0]), `${JSON.stringify(reports.payload, null, 2)}\n`)
  await writeFile(join(root, REPORT_PATHS[1]), renderPayloadVersionReportMarkdown(reports.payload))
  await writeFile(join(root, REPORT_PATHS[2]), `${JSON.stringify(reports.memory, null, 2)}\n`)
  await writeFile(join(root, REPORT_PATHS[3]), renderMemoryV6Markdown(reports.memory))
  await writeFile(join(root, REPORT_PATHS[4]), `${JSON.stringify(reports.cpu, null, 2)}\n`)
  await writeFile(join(root, REPORT_PATHS[5]), renderV6VersionReportMarkdown(reports.cpu))
}

/** Remove successful owned temporary root. */
async function removeOwnedTemporaryRoot(path: string): Promise<void> {
  const resolved = resolve(path)
  if (dirname(resolved) !== resolve(tmpdir()) || !basename(resolved).startsWith('rstore-payload-'))
    throw new TypeError(`Refusing to remove non-owned payload temporary root: ${path}`)
  await rm(resolved, { recursive: true, force: true })
}
