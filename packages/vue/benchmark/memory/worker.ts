import type { MemoryCheckpoints, MemoryWorkerRequest, MemoryWorkerResult } from './types'
import process from 'node:process'
import { BENCHMARK_IMPLEMENTATIONS } from '../entrypoint'
import { captureStableHeap } from './gc'
import { findMemoryScenario } from './profiles'
import { calculateMemoryMeasurement } from './report'

/** Run one implementation and ownership row in this isolated process. */
export async function runMemoryWorker(request: MemoryWorkerRequest): Promise<MemoryWorkerResult> {
  validateNodeVersion()
  validateRequest(request)
  const scenario = findMemoryScenario(request.scenarioId)!
  const implementation = BENCHMARK_IMPLEMENTATIONS.find(candidate => candidate.name === request.implementation)!
  const baselineBytes = await captureStableHeap()
  let runtime = scenario.build(implementation, request.dimensions)
  runtime.validate()
  const setupBytes = await captureStableHeap()
  runtime.advance(0, scenario.warmupUnits)
  runtime.validate()
  const steadyBytes = await captureStableHeap()
  runtime.advance(scenario.warmupUnits, scenario.growthUnits)
  runtime.validate()
  const growthBytes = await captureStableHeap()
  runtime.teardown()
  runtime = undefined as never
  const teardownBytes = await captureStableHeap()
  const checkpoints: MemoryCheckpoints = { baselineBytes, setupBytes, steadyBytes, growthBytes, teardownBytes }
  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    dimensions: request.dimensions,
    implementation: implementation.name,
    unit: scenario.unit,
    warmupUnits: scenario.warmupUnits,
    growthUnits: scenario.growthUnits,
    measurement: calculateMemoryMeasurement(checkpoints, scenario.growthUnits),
  }
}

/** Parse and validate one worker request from CLI arguments. */
export function parseMemoryWorkerRequest(source: string | undefined): MemoryWorkerRequest {
  if (!source)
    throw new TypeError('Memory worker requires a JSON request argument')
  const request = JSON.parse(source) as MemoryWorkerRequest
  validateRequest(request)
  return request
}

/** Validate worker identity and bounded dimensions. */
function validateRequest(request: MemoryWorkerRequest): void {
  if (!findMemoryScenario(request.scenarioId))
    throw new TypeError(`Unknown memory scenario: ${request.scenarioId}`)
  if (!BENCHMARK_IMPLEMENTATIONS.some(candidate => candidate.name === request.implementation))
    throw new TypeError(`Unknown memory implementation: ${request.implementation}`)
  if (!Number.isSafeInteger(request.dimensions?.items) || request.dimensions.items <= 0)
    throw new TypeError(`Memory items must be a positive integer, received ${request.dimensions?.items}`)
  if (!Number.isSafeInteger(request.dimensions.watchers) || request.dimensions.watchers < 0)
    throw new TypeError(`Memory watchers must be a non-negative integer, received ${request.dimensions.watchers}`)
}

/** Require repository-supported Node runtime. */
function validateNodeVersion(): void {
  const major = Number(process.versions.node.split('.')[0])
  if (major < 23)
    throw new Error(`Memory benchmark requires Node 23 or newer, received ${process.version}`)
}
