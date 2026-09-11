import type { CacheImplementation } from '../runtime'

/** Cache implementation label accepted by isolated memory workers. */
export type MemoryImplementationName = CacheImplementation['name']

/** Concrete workload dimensions retained in structured reports. */
export interface MemoryDimensions {
  /** Seeded record count. */
  items: number
  /** Live watcher count. */
  watchers: number
}

/** Heap readings captured around one isolated scenario lifecycle. */
export interface MemoryCheckpoints {
  /** Heap after module loading but before cache construction. */
  baselineBytes: number
  /** Heap after scenario construction and seeding. */
  setupBytes: number
  /** Heap after warmup and forced collection. */
  steadyBytes: number
  /** Heap after bounded repeated operations. */
  growthBytes: number
  /** Heap after full scenario disposal and reference release. */
  teardownBytes: number
}

/** Derived retained-memory values for one implementation and row. */
export interface MemoryMeasurement {
  /** Raw forced-GC heap checkpoints. */
  checkpoints: MemoryCheckpoints
  /** Setup heap above module baseline. */
  setupRetainedBytes: number
  /** Warmed steady-state heap above module baseline. */
  steadyRetainedBytes: number
  /** Signed heap change during repeated operations. */
  growthBytes: number
  /** Signed growth normalized by declared workload unit. */
  growthBytesPerUnit: number
  /** Signed heap remaining after complete disposal. */
  teardownResidualBytes: number
}

/** Mutable scenario lifecycle owned by one isolated worker. */
export interface MemoryScenarioRuntime {
  /** Execute consecutive workload units beginning at stable index. */
  advance: (start: number, count: number) => void
  /** Validate semantic and ownership invariants outside checkpoints. */
  validate: () => void
  /** Stop scopes and dispose cache exactly once. */
  teardown: () => void
}

/** One memory ownership workload shared by legacy and engine. */
export interface MemoryScenarioDefinition {
  /** Stable report identity. */
  id: string
  /** Human-readable report label. */
  name: string
  /** Workload unit label used for normalized growth. */
  unit: string
  /** Units executed before steady-state checkpoint. */
  warmupUnits: number
  /** Units executed between steady and growth checkpoints. */
  growthUnits: number
  /** Construct isolated state through shared public cache APIs. */
  build: (implementation: CacheImplementation, dimensions: MemoryDimensions) => MemoryScenarioRuntime
}

/** One concrete scenario/dimension row. */
export interface MemoryProfileRow {
  /** Scenario behavior. */
  scenario: MemoryScenarioDefinition
  /** Concrete dimensions. */
  dimensions: MemoryDimensions
}

/** Quick or full retained-memory profile. */
export interface MemoryProfile {
  /** Stable profile label. */
  name: 'quick' | 'full'
  /** Concrete rows to execute. */
  rows: readonly MemoryProfileRow[]
}

/** Request passed to one isolated memory worker. */
export interface MemoryWorkerRequest {
  /** Stable scenario id. */
  scenarioId: string
  /** Cache implementation to load. */
  implementation: MemoryImplementationName
  /** Concrete dimensions. */
  dimensions: MemoryDimensions
}

/** Result returned by one isolated memory worker. */
export interface MemoryWorkerResult {
  /** Stable scenario id. */
  scenarioId: string
  /** Human-readable scenario label. */
  scenarioName: string
  /** Concrete dimensions. */
  dimensions: MemoryDimensions
  /** Measured implementation. */
  implementation: MemoryImplementationName
  /** Growth unit label. */
  unit: string
  /** Warmup units executed. */
  warmupUnits: number
  /** Growth units executed. */
  growthUnits: number
  /** Retained-memory measurement. */
  measurement: MemoryMeasurement
}

/** One paired legacy/engine report row. */
export interface MemoryBenchmarkRow {
  /** Stable scenario id. */
  scenarioId: string
  /** Human-readable scenario label. */
  scenarioName: string
  /** Concrete dimensions. */
  dimensions: MemoryDimensions
  /** Growth unit label. */
  unit: string
  /** Warmup units executed. */
  warmupUnits: number
  /** Growth units executed. */
  growthUnits: number
  /** Isolated measurements by implementation. */
  implementations: Record<MemoryImplementationName, MemoryMeasurement>
}

/** Serializable one-run retained-memory report. */
export interface MemoryBenchmarkReport {
  /** Runtime fingerprint required for comparisons. */
  environment: {
    /** Node version. */
    node: string
    /** Operating-system platform. */
    platform: string
    /** CPU architecture. */
    arch: string
    /** Selected profile. */
    profile: MemoryProfile['name']
    /** Frozen legacy fixture SHA-256. */
    legacyHash: string
  }
  /** Paired ownership rows. */
  rows: MemoryBenchmarkRow[]
}

/** One command payload containing one or more independent full reports. */
export interface MemoryBenchmarkRunSet {
  /** Independent reports retained for range calculations. */
  reports: MemoryBenchmarkReport[]
}

/** Median and inclusive range for one metric. */
export interface MemoryMetricSummary {
  /** Middle sorted value. */
  median: number
  /** Minimum and maximum values. */
  range: readonly [number, number]
}

/** Summary of repeated measurements for one implementation. */
export interface MemoryMeasurementSummary {
  /** Setup retained heap summary. */
  setupRetainedBytes: MemoryMetricSummary
  /** Steady retained heap summary. */
  steadyRetainedBytes: MemoryMetricSummary
  /** Repeated-operation growth summary. */
  growthBytes: MemoryMetricSummary
  /** Normalized repeated-operation growth summary. */
  growthBytesPerUnit: MemoryMetricSummary
  /** Post-disposal residual summary. */
  teardownResidualBytes: MemoryMetricSummary
}
