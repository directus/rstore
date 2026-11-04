import type { CacheImplementation } from '../runtime'

/** Implementation label accepted by payload workers. */
export type PayloadImplementationName = CacheImplementation['name']

/** Deterministic payload shape dimensions. */
export interface PayloadDimensions {
  /** Number of root records. */
  items: number
  /** Number of generated scalar fields per record. */
  fields: number
  /** Number of nested objects per mixed record. */
  nestedObjects: number
  /** Number of values in each generated array. */
  arrayLength: number
  /** Measured public operations performed in one worker. */
  operations: number
}

/** Heap and RSS readings around one isolated operation. */
export interface PayloadCheckpoints {
  /** Heap retained after modules and empty runtime load. */
  moduleHeapBytes: number
  /** Heap retained while deterministic source input exists. */
  inputHeapBytes: number
  /** Heap retained after source input is released. */
  retainedHeapBytes: number
  /** Heap retained after complete runtime teardown. */
  teardownHeapBytes: number
  /** Process maximum RSS immediately before measured work. */
  rssBeforeBytes: number
  /** Process maximum RSS immediately after measured work. */
  rssAfterBytes: number
}

/** Derived one-process payload measurement. */
export interface PayloadMeasurement {
  /** Raw lifecycle checkpoints. */
  checkpoints: PayloadCheckpoints
  /** Measured operation wall-clock duration. */
  durationMs: number
  /** Source input heap above module baseline. */
  inputRetainedBytes: number
  /** Cache state heap above module baseline after source release. */
  cacheRetainedBytes: number
  /** Signed process maximum-RSS change during operation. */
  peakRssDeltaBytes: number
  /** Signed heap remaining after complete disposal. */
  teardownResidualBytes: number
}

/** Signed operation metrics after matching lifecycle-control subtraction. */
export interface PayloadControlAdjustedMeasurement {
  /** Operation duration above control work. */
  durationMs: number
  /** Retained cache heap above control retention. */
  cacheRetainedBytes: number
  /** Peak-RSS delta above control watermark movement. */
  peakRssDeltaBytes: number
  /** Disposal residual above control teardown noise. */
  teardownResidualBytes: number
}

/** Median and inclusive range for repeated numeric evidence. */
export interface PayloadMetricSummary {
  /** Middle sorted value. */
  median: number
  /** Minimum and maximum values. */
  range: readonly [number, number]
}

/** One isolated payload worker request. */
export interface PayloadWorkerRequest {
  /** Stable scenario id. */
  scenarioId: string
  /** Cache implementation selected for this process. */
  implementation: PayloadImplementationName
  /** Concrete workload dimensions. */
  dimensions: PayloadDimensions
}

/** One isolated payload worker response. */
export interface PayloadWorkerResult {
  /** Stable scenario id. */
  scenarioId: string
  /** Human-readable scenario name. */
  scenarioName: string
  /** Concrete workload dimensions. */
  dimensions: PayloadDimensions
  /** Approximate source payload size. */
  sourceBytes: number
  /** Measured implementation. */
  implementation: PayloadImplementationName
  /** Lifecycle measurement. */
  measurement: PayloadMeasurement
}

/** Isolated scenario lifecycle with explicit source release. */
export interface PayloadScenarioRuntime {
  /** Approximate serialized source input size. */
  readonly sourceBytes: number
  /** Run measured public workflow exactly once. */
  operate: () => void | Promise<void>
  /** Mutate and release caller-owned source graph. */
  releaseSource: () => void
  /** Validate semantic invariants outside measured region. */
  validate: () => void | Promise<void>
  /** Dispose cache and retained references exactly once. */
  teardown: () => void | Promise<void>
}

/** Shared legacy/engine payload workflow. */
export interface PayloadScenarioDefinition {
  /** Stable scenario identity. */
  id: string
  /** Human-readable report label. */
  name: string
  /** Whether row belongs to large-payload acceptance aggregate. */
  large: boolean
  /** Build deterministic input and runtime outside measured region. */
  build: (implementation: CacheImplementation, dimensions: PayloadDimensions) => PayloadScenarioRuntime | Promise<PayloadScenarioRuntime>
}

/** One concrete payload row. */
export interface PayloadProfileRow {
  /** Scenario workflow. */
  scenario: PayloadScenarioDefinition
  /** Exact payload dimensions. */
  dimensions: PayloadDimensions
}

/** Quick or full payload benchmark profile. */
export interface PayloadProfile {
  /** Stable profile name. */
  name: 'quick' | 'full'
  /** Concrete rows. */
  rows: readonly PayloadProfileRow[]
}

/** Paired isolated measurements for one row. */
export interface PayloadBenchmarkRow {
  /** Stable scenario identity. */
  scenarioId: string
  /** Human-readable label. */
  scenarioName: string
  /** Whether row belongs to large-payload acceptance. */
  large: boolean
  /** Exact dimensions. */
  dimensions: PayloadDimensions
  /** Approximate serialized source size. */
  sourceBytes: number
  /** Measurements by implementation. */
  implementations: Record<PayloadImplementationName, PayloadMeasurement>
}

/** One complete paired payload report. */
export interface PayloadBenchmarkReport {
  /** Runtime fingerprint. */
  environment: {
    /** Node version. */
    node: string
    /** Operating-system platform. */
    platform: string
    /** CPU architecture. */
    arch: string
    /** Selected profile. */
    profile: PayloadProfile['name']
    /** Frozen legacy fixture SHA-256. */
    legacyHash: string
  }
  /** Paired scenario rows. */
  rows: PayloadBenchmarkRow[]
}

/** Repeated full payload reports. */
export interface PayloadBenchmarkRunSet {
  /** Independent process-trial reports. */
  reports: PayloadBenchmarkReport[]
}
