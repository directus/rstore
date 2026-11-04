/** Render retained-memory evidence snapshot in compact human-readable form. */
export function renderMemoryVersionReportMarkdown(report: any): string {
  const rows = report.rows.filter((row: any) => row.scenarioId !== 'empty-control')
  const lower = rows.filter((row: any) => classifyRange(row.normalizedRatioRanges.dataCoreV5) === 'lower').length
  const higher = rows.filter((row: any) => classifyRange(row.normalizedRatioRanges.dataCoreV5) === 'higher').length
  const unclear = rows.length - lower - higher
  const growth = rows.filter((row: any) => row.growthSignals.dataCoreV5 === 'growth detected')
  const lines = [
    '# Data Core v1/v2/v3/v4/v5 retained-memory evidence snapshot',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Environment and versions',
    '',
    `- CPU: ${report.environment.cpu ?? 'unknown'}`,
    `- OS: ${report.environment.os ?? `${report.environment.platform}/${report.environment.arch}`}`,
    `- Node: ${report.environment.node}`,
    `- pnpm: ${report.environment.pnpm ?? 'unknown'}`,
    `- Frozen legacy SHA-256: ${report.versions.legacyHash}`,
    `- Data Core v1: ${report.versions.dataCoreV1}`,
    `- Data Core v2: ${report.versions.dataCoreV2}`,
    `- Data Core v3: ${report.versions.dataCoreV3}`,
    `- Data Core v4: ${report.versions.dataCoreV4}`,
    `- Data Core v5: ${report.versions.dataCoreV5}`,
    `- Candidate diff SHA-256: ${report.versions.candidateDiffHash}`,
    '',
    '## Summary',
    '',
    `- Steady retained heap versus paired legacy: ${lower}/${rows.length} clearly lower, ${higher}/${rows.length} clearly higher, ${unclear}/${rows.length} unclear across three runs.`,
    `- Repeatable v5 retained-growth signals above empty-control envelope: ${growth.length}.`,
    `- Practical steady-memory parity: ${rows.filter((row: any) => row.parity?.steady === 'meets target').length} meet target, ${rows.filter((row: any) => row.parity?.steady === 'near parity').length} near parity, ${rows.filter((row: any) => row.parity?.steady === 'misses target').length} miss target.`,
    '- Evidence remains informational. No CI thresholds or stored memory budgets apply.',
    '',
    '## Measurement contract',
    '',
    '- Every implementation/scenario runs in a separate Node process with `--expose-gc`.',
    '- Every checkpoint uses lowest `heapUsed` reading across five forced collections after one event-loop turn.',
    '- Steady retained heap is expected live state after construction and warmup, relative to module baseline.',
    '- Growth is signed heap change after bounded repeated work. `growth detected` requires all three values to exceed matching empty-control envelope.',
    '- Teardown residual is signed heap remaining after scopes stop, cache disposal, reference release, and forced collection.',
    '- Version ratios first normalize engine retained heap by same-run frozen legacy. Lower ratios use less retained heap.',
    '',
    '## Ownership rows',
    '',
    '| Scenario | Items | Legacy MiB | v1 MiB | v2 MiB | v3 MiB | v4 MiB | v5 MiB | v5/legacy | v5/v4 | Memory target | v5 growth KiB | Growth signal | v5 teardown KiB |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---|---:|',
  ]
  for (const row of report.rows) {
    const comparison = row.v5Comparisons
    lines.push(`| ${row.scenarioName} | ${row.dimensions.items} | ${mib(row.medians.legacyBytes)} | ${mib(row.medians.dataCoreV1Bytes)} | ${mib(row.medians.dataCoreV2Bytes)} | ${mib(row.medians.dataCoreV3Bytes)} | ${mib(row.medians.dataCoreV4Bytes)} | ${mib(row.medians.dataCoreV5Bytes)} | ${formatRatio(row.normalizedRatios?.dataCoreV5, row.normalizedRatioRanges?.dataCoreV5)} | ${formatRatio(comparison?.dataCoreV5VsV4, comparison?.dataCoreV5VsV4Envelope)} | ${row.parity?.steady ?? 'control'} | ${kib(row.summaries.dataCoreV5.growthBytes.median)} | ${row.growthSignals.dataCoreV5} | ${kib(row.summaries.dataCoreV5.teardownResidualBytes.median)} |`)
  }
  lines.push('', '## Retained-growth signals', '')
  if (growth.length) {
    for (const row of growth)
      lines.push(`- ${row.scenarioId} (${row.dimensions.items} items): ${kib(row.summaries.dataCoreV5.growthBytes.median)} KiB median over ${row.growthUnits} ${row.unit}; range ${formatKiBRange(row.summaries.dataCoreV5.growthBytes.range)} KiB.`)
  }
  else {
    lines.push('- None. Every v5 row overlaps or stays below same-run empty-control noise envelope.')
  }
  lines.push('', '## Post-disposal residuals', '')
  lines.push('- Residual values include runtime/JIT noise still present after scenario references are released; interpret only with three-run ranges and empty control.')
  for (const row of report.rows)
    lines.push(`- ${row.scenarioId} (${row.dimensions.items}): v5 median ${kib(row.summaries.dataCoreV5.teardownResidualBytes.median)} KiB; range ${formatKiBRange(row.summaries.dataCoreV5.teardownResidualBytes.range)} KiB.`)
  lines.push('', 'Companion JSON retains raw checkpoints, signed deltas, all runs, envelopes, and exact workload dimensions.', '')
  return lines.join('\n')
}

/** Classify same-run normalized range relative to legacy parity. */
function classifyRange(range: readonly [number, number]): 'lower' | 'higher' | 'unclear' {
  if (range[1] < 1)
    return 'lower'
  if (range[0] > 1)
    return 'higher'
  return 'unclear'
}

/** Format retained bytes as mebibytes. */
function mib(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(3)
}

/** Format signed bytes as kibibytes. */
function kib(bytes: number): string {
  return (bytes / 1024).toFixed(2)
}

/** Format ratio and conservative range. */
function formatRatio(value: number | undefined, range: readonly [number, number] | undefined): string {
  if (value === undefined || !range)
    return 'control'
  return `${value.toFixed(3)}× [${range[0].toFixed(3)}, ${range[1].toFixed(3)}]`
}

/** Format signed KiB range. */
function formatKiBRange(range: readonly [number, number]): string {
  return `${kib(range[0])}–${kib(range[1])}`
}
