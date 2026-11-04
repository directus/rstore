/** Render v5/v6 payload evidence snapshot. */
export function renderPayloadVersionReportMarkdown(report: any): string {
  const aggregate = report.aggregate
  const lines = [
    '# Data Core v5/v6 big-payload evidence snapshot',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Environment and identities',
    '',
    `- Node: ${report.environment.node}`,
    `- OS: ${report.environment.os ?? `${report.environment.platform}/${report.environment.arch}`}`,
    `- CPU: ${report.environment.cpu ?? 'unknown'}`,
    `- Data Core v5: ${report.versions.dataCoreV5}`,
    `- Data Core v6: ${report.versions.dataCoreV6}`,
    `- Candidate diff SHA-256: ${report.versions.candidateDiffHash}`,
    `- Frozen legacy SHA-256: ${report.versions.legacyHash}`,
    '',
    '## Summary',
    '',
    `- Large-row duration geometric mean v6/v5: ${ratio(aggregate.durationGeometricMeanRatio)}.`,
    `- Every large row within 5% of v5 duration: ${yesNo(aggregate.everyDurationWithinFivePercent)}.`,
    `- Large-row peak-RSS geometric mean v6/v5: ${ratio(aggregate.peakRssGeometricMeanRatio)} (${aggregate.peakRssClassification}).`,
    `- Every large row within 5% of v5 peak-RSS delta: ${yesNo(aggregate.everyPeakRssWithinFivePercent)}.`,
    `- Every large row lower retained heap than v5: ${yesNo(aggregate.everyRetainedBelowV5)}.`,
    `- Every large row at paired legacy retained-heap parity: ${yesNo(aggregate.everyRetainedAtLegacyParity)}.`,
    '- Evidence remains informational; no CI performance gate applies.',
    '',
    '## Rows',
    '',
    '| Scenario | Dimensions | Source MiB | v5 ms | v6 ms | v6/v5 time | v5 retained MiB | v6 retained MiB | v6/v5 retained | v6/legacy retained | RSS result | Teardown KiB |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|',
  ]
  for (const row of report.rows) {
    const summaries = row.summaries
    lines.push(`| ${row.scenarioName} | ${dimensions(row.dimensions)} | ${mib(row.sourceBytes)} | ${summaries.dataCoreV5.durationMs.median.toFixed(2)} | ${summaries.dataCoreV6.durationMs.median.toFixed(2)} | ${comparison(row.comparisons.duration)} | ${mib(summaries.dataCoreV5.cacheRetainedBytes.median)} | ${mib(summaries.dataCoreV6.cacheRetainedBytes.median)} | ${comparison(row.comparisons.retainedHeap)} | ${comparison(row.comparisons.retainedHeapVsLegacy)} | ${comparison(row.comparisons.peakRssDelta)} | ${kib(summaries.dataCoreV6.teardownResidualBytes.median)} |`)
  }
  lines.push(
    '',
    '## Interpretation',
    '',
    '- Duration and retained-heap ratios are lower-is-better.',
    '- RSS and retained values crossing zero use signed absolute deltas, shown as `delta`, instead of invalid ratios.',
    '- Retained heap is live cache state after caller source release and five forced-GC passes.',
    '- Teardown residual is signed heap remaining after references release and cache disposal.',
    '- JSON companion retains all five raw runs, ranges, conservative envelopes, checkpoints, and dimensions.',
    '',
  )
  return lines.join('\n')
}

/** Format dimensions compactly. */
function dimensions(value: any): string {
  return `${value.items} items, ${value.fields} fields, ${value.nestedObjects} nested, ${value.arrayLength} array, ${value.operations} ops`
}

/** Format ratio or signed comparison. */
function comparison(value: any): string {
  return value.medianRatio == null ? `delta ${mib(value.medianDelta)} MiB` : `${ratio(value.medianRatio)} [${ratio(value.envelope[0])}, ${ratio(value.envelope[1])}]`
}

/** Format optional ratio. */
function ratio(value: number | null): string {
  return value == null ? 'inconclusive' : `${value.toFixed(3)}x`
}

/** Format bytes as MiB. */
function mib(value: number): string {
  return (value / 1024 / 1024).toFixed(2)
}

/** Format bytes as KiB. */
function kib(value: number): string {
  return (value / 1024).toFixed(1)
}

/** Format boolean acceptance result. */
function yesNo(value: boolean): string {
  return value ? 'yes' : 'no'
}
