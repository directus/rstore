import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { cpus, release, type } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'
import { summarizeCpuProfile } from './cpu-profile-report'
import { applyBenchmarkReruns } from './report-reruns'
import { parseBenchmarkOutput } from './version-report'
import { combineV4VersionReports } from './version-report-v4'
import { renderV4VersionReportMarkdown } from './version-report-v4-markdown'

const BASELINE_PATH = resolve('benchmark/reports/data-core-v1-v2-v3.json')
const OUTPUT_JSON = resolve('benchmark/reports/data-core-v1-v2-v3-v4.json')
const OUTPUT_MARKDOWN = resolve('benchmark/reports/data-core-v1-v2-v3-v4.md')
const GENERATED_REPORT_PATHS = [
  'packages/vue/benchmark/reports/data-core-v1-v2-v3-v4.json',
  'packages/vue/benchmark/reports/data-core-v1-v2-v3-v4.md',
]

/** Build final artifacts from three v4 logs and optional fresh v3 logs. */
function run(): void {
  const inputs = process.argv.slice(2)
  if (inputs.length !== 3 && inputs.length !== 6) {
    throw new TypeError('Usage: pnpm benchmark:combine-reports <v4-run-1..3> [v3-run-1..3]')
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const candidates = inputs.slice(0, 3).map(path => parseBenchmarkOutput(readFileSync(resolve(path), 'utf8')))
  const rerunPaths = process.env.RSTORE_BENCH_RERUNS?.split(',').filter(Boolean) ?? []
  candidates[2] = applyBenchmarkReruns(candidates[2]!, rerunPaths.map(path => parseBenchmarkOutput(readFileSync(resolve(path), 'utf8'))))
  const currentV3 = inputs.slice(3).map(path => parseBenchmarkOutput(readFileSync(resolve(path), 'utf8')))
  const v1 = git('rev-parse', '30318e8')
  const v2 = git('rev-parse', 'ffdc11c')
  const v3 = git('rev-parse', '98cc5a7')
  const v4Base = git('rev-parse', 'd10f007')
  const report = combineV4VersionReports(baseline, candidates, {
    legacy: 'packages/vue/benchmark/legacy-cache.ts',
    dataCoreV1: v1,
    dataCoreV2: v2,
    dataCoreV3: v3,
    dataCoreV4: `uncommitted working tree based on ${v4Base}`,
    candidateDiffHash: candidateDiffHash(),
  }, currentV3)
  report.environment = {
    ...report.environment,
    cpu: cpus()[0]?.model ?? 'unknown',
    threads: cpus().length,
    os: `${type()} ${release()} ${process.arch}`,
    pnpm: execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim(),
  }
  if (process.env.RSTORE_CPU_PROFILE)
    report.cpuProfileEvidence = summarizeCpuProfile(resolve(process.env.RSTORE_CPU_PROFILE))
  writeFileSync(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(OUTPUT_MARKDOWN, renderV4VersionReportMarkdown(report))
  console.log(`Wrote ${OUTPUT_MARKDOWN}`)
  console.log(`Wrote ${OUTPUT_JSON}`)
}

/** Hash tracked diff plus untracked candidate sources, excluding outputs. */
function candidateDiffHash(): string {
  const root = git('rev-parse', '--show-toplevel')
  const diff = execFileSync('git', [
    '-C',
    root,
    'diff',
    '--binary',
    'HEAD',
    '--',
    '.',
    ...GENERATED_REPORT_PATHS.map(path => `:(exclude)${path}`),
  ], { maxBuffer: 16 * 1024 * 1024 })
  const digest = createHash('sha256').update(diff)
  const untracked = execFileSync('git', ['-C', root, 'ls-files', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(path => path && !GENERATED_REPORT_PATHS.includes(path))
    .sort()
  for (const path of untracked) {
    digest.update(path).update('\0').update(readFileSync(resolve(root, path)))
  }
  return digest.digest('hex')
}

/** Run one read-only Git identity command. */
function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

run()
