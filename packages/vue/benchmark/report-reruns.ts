import type { BenchmarkReport } from './runner'

/** Replace exhausted noisy rows with explicit isolated retry reports. */
export function applyBenchmarkReruns(
  report: BenchmarkReport,
  reruns: readonly BenchmarkReport[],
): BenchmarkReport {
  if (!reruns.length)
    return report
  const rows = new Map(report.rows.map(row => [rowKey(row), row]))
  for (const retry of reruns) {
    if (retry.environment.node !== report.environment.node)
      throw new TypeError(`Retry Node mismatch: ${retry.environment.node} != ${report.environment.node}`)
    for (const replacement of retry.rows) {
      const key = rowKey(replacement)
      const previous = rows.get(key)
      if (!previous)
        throw new TypeError(`Retry report contains unknown benchmark row ${key}`)
      assertCountsMatch(previous, replacement)
      rows.set(key, {
        ...replacement,
        reruns: previous.reruns + replacement.reruns + 1,
      })
    }
  }
  return { ...report, rows: report.rows.map(row => rows.get(rowKey(row))!) }
}

/** Preserve validation-only reactive rerun counts across timing retries. */
function assertCountsMatch(
  previous: BenchmarkReport['rows'][number],
  replacement: BenchmarkReport['rows'][number],
): void {
  for (const implementation of Object.keys(previous.implementations)) {
    const before = previous.implementations[implementation]?.counts
    const after = replacement.implementations[implementation]?.counts
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw new TypeError(`Retry changed reactive counts for ${rowKey(previous)} (${implementation})`)
  }
}

/** Return stable scenario and item dimension key. */
function rowKey(row: { scenarioId: string, dimensions: { items: number } }): string {
  return `${row.scenarioId}|${row.dimensions.items}`
}
