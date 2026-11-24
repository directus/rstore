import type { PayloadBenchmarkReport, PayloadBenchmarkRow, PayloadBenchmarkRunSet, PayloadImplementationName, PayloadProfile, PayloadProfileRow, PayloadWorkerRequest, PayloadWorkerResult } from './types'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { runIsolatedWorkerProcess } from '../worker-process'

const REPORT_START = 'RSTORE_PAYLOAD_REPORT_START'
const REPORT_END = 'RSTORE_PAYLOAD_REPORT_END'

/** Run selected rows with one isolated process per implementation and trial. */
export async function runPayloadProfile(profile: PayloadProfile, trials = readTrialCount()): Promise<PayloadBenchmarkRunSet> {
  const selectedRows = selectPayloadRows(profile)
  const trialOffset = readTrialOffset()
  const reports: PayloadBenchmarkReport[] = []
  for (let trial = 0; trial < trials; trial++) {
    const rows: PayloadBenchmarkRow[] = []
    for (const row of selectedRows) {
      const order: PayloadImplementationName[] = (trial + trialOffset) % 2 === 0 ? ['legacy', 'engine'] : ['engine', 'legacy']
      const results = {} as Record<PayloadImplementationName, PayloadWorkerResult>
      for (const implementation of order)
        results[implementation] = await runPayloadWorkerProcess(row, implementation)
      const paired = pairResults(row, results.legacy, results.engine)
      rows.push(paired)
      printRow(trial, paired)
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

/** Run profile and print structured JSON between stable markers. */
export async function runPayloadCommand(profile: PayloadProfile): Promise<void> {
  try {
    const result = await runPayloadProfile(profile)
    console.log(REPORT_START)
    console.log(JSON.stringify(result, null, 2))
    console.log(REPORT_END)
  }
  catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}

/** Parse structured output from console-plus-JSON command. */
export function parsePayloadBenchmarkOutput(source: string): PayloadBenchmarkRunSet {
  const start = source.lastIndexOf(REPORT_START)
  const end = source.indexOf(REPORT_END, start)
  if (start < 0 || end < 0)
    throw new TypeError('Payload benchmark output is missing structured report markers')
  const result = JSON.parse(source.slice(start + REPORT_START.length, end).trim()) as PayloadBenchmarkRunSet
  if (!Array.isArray(result.reports) || !result.reports.length)
    throw new TypeError('Payload benchmark output contains no reports')
  return result
}

/** Select profile rows through strict diagnostic filters. */
export function selectPayloadRows(profile: PayloadProfile): PayloadProfileRow[] {
  const scenario = process.env.RSTORE_PAYLOAD_SCENARIO
  const items = readOptionalInteger('RSTORE_PAYLOAD_ITEMS')
  const fields = readOptionalInteger('RSTORE_PAYLOAD_FIELDS')
  if ((items !== undefined || fields !== undefined) && !scenario)
    throw new TypeError('RSTORE_PAYLOAD_ITEMS and RSTORE_PAYLOAD_FIELDS require RSTORE_PAYLOAD_SCENARIO')
  let rows = [...profile.rows]
  if (scenario) {
    rows = rows.filter(row => row.scenario.id === scenario)
    if (!rows.length)
      throw new TypeError(`Unknown payload scenario for ${profile.name} profile: ${scenario}`)
    const selected = rows[0]!
    rows = [{ ...selected, dimensions: { ...selected.dimensions, items: items ?? selected.dimensions.items, fields: fields ?? selected.dimensions.fields } }]
  }
  return rows
}

/** Spawn one actual Node worker with explicit GC. */
export async function runPayloadWorkerProcess(row: PayloadProfileRow, implementation: PayloadImplementationName): Promise<PayloadWorkerResult> {
  const request: PayloadWorkerRequest = { scenarioId: row.scenario.id, implementation, dimensions: row.dimensions }
  const worker = resolve(dirname(fileURLToPath(import.meta.url)), 'worker-entry.ts')
  return runIsolatedWorkerProcess<PayloadWorkerResult>({
    maxBuffer: 8 * 1024 * 1024,
    request,
    resultPrefix: 'rstore-payload-worker-',
    validateResult: (result) => {
      if (result.scenarioId !== row.scenario.id || result.implementation !== implementation)
        throw new TypeError(`Payload worker identity mismatch for ${row.scenario.id}/${implementation}`)
    },
    workerPath: worker,
  })
}

/** Pair equivalent isolated worker results. */
function pairResults(row: PayloadProfileRow, legacy: PayloadWorkerResult, engine: PayloadWorkerResult): PayloadBenchmarkRow {
  if (JSON.stringify(legacy.dimensions) !== JSON.stringify(engine.dimensions) || legacy.sourceBytes !== engine.sourceBytes)
    throw new TypeError(`Payload worker row drift for ${row.scenario.id}`)
  return {
    scenarioId: row.scenario.id,
    scenarioName: row.scenario.name,
    large: row.scenario.large,
    dimensions: row.dimensions,
    sourceBytes: legacy.sourceBytes,
    implementations: { legacy: legacy.measurement, engine: engine.measurement },
  }
}

/** Read strict positive trial count. */
function readTrialCount(): number {
  return readOptionalInteger('RSTORE_PAYLOAD_TRIALS', 20) ?? 1
}

/** Read controller-only trial offset used to alternate process ordering. */
function readTrialOffset(): number {
  const source = process.env.RSTORE_PAYLOAD_TRIAL_OFFSET
  if (source === undefined)
    return 0
  const value = Number(source)
  if (!Number.isSafeInteger(value) || value < 0 || value > 19)
    throw new TypeError(`RSTORE_PAYLOAD_TRIAL_OFFSET must be an integer between 0 and 19, received ${source}`)
  return value
}

/** Read one strict positive integer environment value. */
function readOptionalInteger(name: string, maximum = Number.MAX_SAFE_INTEGER): number | undefined {
  const source = process.env[name]
  if (source === undefined)
    return undefined
  const value = Number(source)
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum)
    throw new TypeError(`${name} must be an integer between 1 and ${maximum}, received ${source}`)
  return value
}

/** Hash frozen legacy cache fixture. */
async function legacyFixtureHash(): Promise<string> {
  const path = resolve(dirname(fileURLToPath(import.meta.url)), '../legacy-cache.ts')
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

/** Print one compact local diagnostic row. */
function printRow(trial: number, row: PayloadBenchmarkRow): void {
  console.table(Object.entries(row.implementations).map(([implementation, value]) => ({
    'trial': trial + 1,
    'scenario': row.scenarioId,
    'items': row.dimensions.items,
    'implementation': implementation,
    'duration ms': value.durationMs.toFixed(2),
    'retained MiB': (value.cacheRetainedBytes / 1024 / 1024).toFixed(2),
    'RSS delta MiB': (value.peakRssDeltaBytes / 1024 / 1024).toFixed(2),
  })))
}
