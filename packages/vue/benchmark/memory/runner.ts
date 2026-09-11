import type { MemoryBenchmarkReport, MemoryBenchmarkRow, MemoryBenchmarkRunSet, MemoryImplementationName, MemoryProfile, MemoryProfileRow, MemoryWorkerRequest, MemoryWorkerResult } from './types'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const REPORT_START = 'RSTORE_MEMORY_REPORT_START'
const REPORT_END = 'RSTORE_MEMORY_REPORT_END'

/** Run selected rows with one child process per implementation and trial. */
export async function runMemoryProfile(profile: MemoryProfile, trials = readTrialCount()): Promise<MemoryBenchmarkRunSet> {
  const selectedRows = selectMemoryRows(profile)
  const reports: MemoryBenchmarkReport[] = []
  for (let trial = 0; trial < trials; trial++) {
    const rows: MemoryBenchmarkRow[] = []
    for (const row of selectedRows) {
      const legacy = await runWorker(row, 'legacy')
      const engine = await runWorker(row, 'engine')
      const reportRow = pairWorkerResults(legacy, engine)
      rows.push(reportRow)
      printRow(trial, reportRow)
    }
    reports.push({
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        profile: profile.name,
        legacyHash: await legacyFixtureHash(),
      },
      rows,
    })
  }
  return { reports }
}

/** Run profile and print one parseable structured payload. */
export async function runMemoryCommand(profile: MemoryProfile): Promise<void> {
  try {
    const result = await runMemoryProfile(profile)
    console.log(REPORT_START)
    console.log(JSON.stringify(result, null, 2))
    console.log(REPORT_END)
  }
  catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}

/** Parse structured payload from console-plus-JSON command output. */
export function parseMemoryBenchmarkOutput(source: string): MemoryBenchmarkRunSet {
  const start = source.lastIndexOf(REPORT_START)
  const end = source.indexOf(REPORT_END, start)
  if (start < 0 || end < 0)
    throw new TypeError('Memory benchmark output is missing structured report markers')
  const json = source.slice(start + REPORT_START.length, end).trim()
  const result = JSON.parse(json) as MemoryBenchmarkRunSet
  if (!Array.isArray(result.reports) || !result.reports.length)
    throw new TypeError('Memory benchmark output contains no reports')
  return result
}

/** Select rows through strict optional diagnostic filters. */
export function selectMemoryRows(profile: MemoryProfile): MemoryProfileRow[] {
  const scenarioId = process.env.RSTORE_MEMORY_SCENARIO
  const requestedItems = readOptionalPositiveInteger('RSTORE_MEMORY_ITEMS')
  if (requestedItems !== undefined && !scenarioId)
    throw new TypeError('RSTORE_MEMORY_ITEMS requires RSTORE_MEMORY_SCENARIO')
  let rows = [...profile.rows]
  if (scenarioId) {
    rows = rows.filter(row => row.scenario.id === scenarioId)
    if (!rows.length)
      throw new TypeError(`Unknown memory scenario for ${profile.name} profile: ${scenarioId}`)
    if (requestedItems !== undefined)
      rows = [{ ...rows[0]!, dimensions: { ...rows[0]!.dimensions, items: requestedItems } }]
  }
  return rows
}

/** Run one worker with explicit GC in isolated Node process. */
async function runWorker(row: MemoryProfileRow, implementation: MemoryImplementationName): Promise<MemoryWorkerResult> {
  const request: MemoryWorkerRequest = { scenarioId: row.scenario.id, implementation, dimensions: row.dimensions }
  const require = createRequire(import.meta.url)
  const viteNode = require.resolve('vite-node/cli')
  const worker = resolve(dirname(fileURLToPath(import.meta.url)), 'worker-entry.ts')
  const config = resolve(process.cwd(), 'vitest.config.ts')
  const outputDirectory = await mkdtemp(join(tmpdir(), 'rstore-memory-worker-'))
  const outputPath = join(outputDirectory, 'result.json')
  try {
    await execFileAsync(process.execPath, ['--expose-gc', viteNode, '--config', config, worker, JSON.stringify(request)], {
      cwd: process.cwd(),
      env: { ...process.env, RSTORE_BENCHMARK_RESULT_PATH: outputPath },
      maxBuffer: 4 * 1024 * 1024,
    })
    const result = JSON.parse(await readFile(outputPath, 'utf8')) as MemoryWorkerResult
    if (result.scenarioId !== row.scenario.id || result.implementation !== implementation)
      throw new TypeError(`Memory worker identity mismatch for ${row.scenario.id}/${implementation}`)
    return result
  }
  finally {
    await rm(outputDirectory, { recursive: true, force: true })
  }
}

/** Pair equivalent isolated worker results. */
function pairWorkerResults(legacy: MemoryWorkerResult, engine: MemoryWorkerResult): MemoryBenchmarkRow {
  if (JSON.stringify(legacy.dimensions) !== JSON.stringify(engine.dimensions) || legacy.scenarioId !== engine.scenarioId)
    throw new TypeError('Memory worker row mismatch')
  return {
    scenarioId: legacy.scenarioId,
    scenarioName: legacy.scenarioName,
    dimensions: legacy.dimensions,
    unit: legacy.unit,
    warmupUnits: legacy.warmupUnits,
    growthUnits: legacy.growthUnits,
    implementations: { legacy: legacy.measurement, engine: engine.measurement },
  }
}

/** Print compact retained-memory row for local diagnostics. */
function printRow(trial: number, row: MemoryBenchmarkRow): void {
  console.table(Object.entries(row.implementations).map(([implementation, value]) => ({
    'trial': trial + 1,
    'scenario': row.scenarioId,
    'items': row.dimensions.items,
    'implementation': implementation,
    'steady MiB': formatMiB(value.steadyRetainedBytes),
    'growth KiB': formatKiB(value.growthBytes),
    'teardown KiB': formatKiB(value.teardownResidualBytes),
  })))
}

/** Read positive trial count with conservative upper bound. */
function readTrialCount(): number {
  return readOptionalPositiveInteger('RSTORE_MEMORY_TRIALS', 20) ?? 1
}

/** Read one strict positive integer environment value. */
function readOptionalPositiveInteger(name: string, maximum = Number.MAX_SAFE_INTEGER): number | undefined {
  const source = process.env[name]
  if (source === undefined)
    return undefined
  const value = Number(source)
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum)
    throw new TypeError(`${name} must be an integer between 1 and ${maximum}, received ${source}`)
  return value
}

/** Hash frozen legacy fixture loaded by paired workers. */
async function legacyFixtureHash(): Promise<string> {
  const path = resolve(dirname(fileURLToPath(import.meta.url)), '../legacy-cache.ts')
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

/** Format bytes as mebibytes. */
function formatMiB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(3)
}

/** Format bytes as kibibytes. */
function formatKiB(bytes: number): string {
  return (bytes / 1024).toFixed(2)
}
