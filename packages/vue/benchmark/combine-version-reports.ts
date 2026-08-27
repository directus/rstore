import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { cpus, release, type } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'
import { summarizeCpuProfile } from './cpu-profile-report'
import { combineVersionReports, parseBenchmarkOutput } from './version-report'
import { renderVersionReportMarkdown } from './version-report-markdown'

const BASELINE_PATH = resolve('benchmark/reports/data-core-v1-v2.json')
const OUTPUT_JSON = resolve('benchmark/reports/data-core-v1-v2-v3.json')
const OUTPUT_MARKDOWN = resolve('benchmark/reports/data-core-v1-v2-v3.md')

/** Build final artifacts from exactly three full paired v3 run logs. */
function run(): void {
  const inputs = process.argv.slice(2)
  if (inputs.length !== 3 && inputs.length !== 6) {
    throw new TypeError('Usage: pnpm benchmark:combine-reports <v3-run-1..3> [v2-run-1..3]')
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const candidates = inputs.slice(0, 3).map(path => parseBenchmarkOutput(readFileSync(resolve(path), 'utf8')))
  const currentV2 = inputs.slice(3).map(path => parseBenchmarkOutput(readFileSync(resolve(path), 'utf8')))
  const v1 = git('rev-parse', '30318e8')
  const v2 = git('rev-parse', 'ffdc11c')
  const report = combineVersionReports(baseline, candidates, {
    legacy: 'packages/vue/benchmark/legacy-cache.ts',
    dataCoreV1: v1,
    dataCoreV2: v2,
    dataCoreV3: `uncommitted working tree based on ${v2}`,
    candidateDiffHash: candidateDiffHash(),
  }, currentV2)
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
  writeFileSync(OUTPUT_MARKDOWN, renderVersionReportMarkdown(report))
  console.log(`Wrote ${OUTPUT_MARKDOWN}`)
  console.log(`Wrote ${OUTPUT_JSON}`)
}

/** Hash tracked diff plus untracked candidate sources, excluding outputs. */
function candidateDiffHash(): string {
  const root = git('rev-parse', '--show-toplevel')
  const digest = createHash('sha256').update(execFileSync('git', ['-C', root, 'diff', '--binary', 'HEAD']))
  const untracked = execFileSync('git', ['-C', root, 'ls-files', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(path => path && !path.endsWith('data-core-v1-v2-v3.json') && !path.endsWith('data-core-v1-v2-v3.md'))
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
