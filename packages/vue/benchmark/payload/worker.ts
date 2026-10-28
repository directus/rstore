import type { PayloadCheckpoints, PayloadWorkerRequest, PayloadWorkerResult } from './types'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { BENCHMARK_IMPLEMENTATIONS } from '../entrypoint'
import { captureStableHeap } from '../memory/gc'
import { findPayloadScenario } from './profiles'
import { calculatePayloadMeasurement } from './report'

/** Run one implementation and payload row in this isolated process. */
export async function runPayloadWorker(request: PayloadWorkerRequest): Promise<PayloadWorkerResult> {
  validateNodeVersion()
  validateRequest(request)
  const scenario = findPayloadScenario(request.scenarioId)!
  const implementation = BENCHMARK_IMPLEMENTATIONS.find(candidate => candidate.name === request.implementation)!
  const moduleHeapBytes = await captureStableHeap()
  let runtime = await scenario.build(implementation, request.dimensions)
  const inputHeapBytes = await captureStableHeap()
  const rssBeforeBytes = maxRssBytes()
  const started = performance.now()
  await runtime.operate()
  const durationMs = performance.now() - started
  const rssAfterBytes = maxRssBytes()
  runtime.releaseSource()
  await runtime.validate()
  const retainedHeapBytes = await captureStableHeap()
  const sourceBytes = runtime.sourceBytes
  await runtime.teardown()
  runtime = undefined as never
  const teardownHeapBytes = await captureStableHeap()
  const checkpoints: PayloadCheckpoints = {
    moduleHeapBytes,
    inputHeapBytes,
    retainedHeapBytes,
    teardownHeapBytes,
    rssBeforeBytes,
    rssAfterBytes,
  }
  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    dimensions: request.dimensions,
    sourceBytes,
    implementation: implementation.name,
    measurement: calculatePayloadMeasurement(checkpoints, durationMs),
  }
}

/** Parse one worker JSON request. */
export function parsePayloadWorkerRequest(source: string | undefined): PayloadWorkerRequest {
  if (!source)
    throw new TypeError('Payload worker requires a JSON request argument')
  const request = JSON.parse(source) as PayloadWorkerRequest
  validateRequest(request)
  return request
}

/** Validate worker scenario, implementation, and dimensions. */
function validateRequest(request: PayloadWorkerRequest): void {
  if (!findPayloadScenario(request.scenarioId))
    throw new TypeError(`Unknown payload scenario: ${request.scenarioId}`)
  if (!BENCHMARK_IMPLEMENTATIONS.some(candidate => candidate.name === request.implementation))
    throw new TypeError(`Unknown payload implementation: ${request.implementation}`)
  for (const name of ['items', 'fields', 'nestedObjects', 'arrayLength', 'operations'] as const) {
    const value = request.dimensions?.[name]
    const minimum = name === 'items' || name === 'operations' ? 1 : 0
    if (!Number.isSafeInteger(value) || value < minimum)
      throw new TypeError(`Payload ${name} must be an integer at least ${minimum}, received ${value}`)
  }
}

/** Require repository-supported Node runtime. */
function validateNodeVersion(): void {
  const major = Number(process.versions.node.split('.')[0])
  if (major < 23)
    throw new Error(`Payload benchmark requires Node 23 or newer, received ${process.version}`)
}

/** Return process maximum RSS in bytes. */
function maxRssBytes(): number {
  return process.resourceUsage().maxRSS * 1024
}
