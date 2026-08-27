/** Render final four-version report with full v3 run evidence. */
export function renderVersionReportMarkdown(report: any): string {
  const quality = report.runQuality.dataCoreV3
  const lines = [
    '# Data Core v1/v2/v3 performance report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Environment and versions',
    '',
    `- CPU: ${report.environment.cpu ?? 'unknown'}`,
    `- OS: ${report.environment.os ?? `${report.environment.candidate.platform}/${report.environment.candidate.arch}`}`,
    `- Node: ${report.environment.candidate.node}`,
    `- pnpm: ${report.environment.pnpm ?? 'unknown'}`,
    `- Legacy: ${report.versions.legacy}`,
    `- Data Core v1: ${report.versions.dataCoreV1}`,
    `- Data Core v2/base: ${report.versions.dataCoreV2}`,
    `- Data Core v3: ${report.versions.dataCoreV3}`,
    `- Candidate diff SHA-256: ${report.versions.candidateDiffHash}`,
    '',
    '## Acceptance summary',
    '',
    ...quality.map((run: any, index: number) => `- Run ${index + 1}: ${run.classification.faster}/59 engine faster, ${run.classification.slower} legacy faster, ${run.classification.noClearDifference} no clear difference, ${run.classification.noisy} noisy; max RME ${format(run.maxRme)}%; retries ${run.reruns}.`),
    `- Clear v3 regressions versus v2: ${report.residualRegressions.versusV2.length}.`,
    `- Clear v3 regressions versus v1: ${report.residualRegressions.versusV1.length}.`,
    `- V1-normalized point estimates below parity: ${report.residualRegressions.v1PointEstimatesBelowParity.length}; none count as regressions unless confidence envelope stays below 1.`,
    '',
    'Ratio above 1 favors Data Core v3. Version envelopes compare paired legacy-normalized speedups across every run pairing; confidence envelopes also retain each benchmark margin.',
    '',
    '## All 59 benchmark rows',
    '',
    '| Scenario | Items | Legacy median µs | v1 median µs | v2 median µs | v3 median µs | v3/legacy range | v3/v2 envelope | v3/v1 envelope |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  ]
  for (const row of report.rows) {
    lines.push(`| ${row.scenarioName} | ${row.dimensions.items} | ${format(row.medians.legacyMicroseconds)} | ${format(row.medians.dataCoreV1Microseconds)} | ${format(row.medians.dataCoreV2Microseconds)} | ${format(row.medians.dataCoreV3Microseconds)} | ${formatRange(row.speedups.dataCoreV3VsLegacyRange)} | ${formatRange(row.speedups.dataCoreV3VsV2Envelope)} | ${formatRange(row.speedups.dataCoreV3VsV1Envelope)} |`)
  }
  lines.push('', '## Data Core v3 per-run evidence', '')
  lines.push('| Scenario | Items | Run 1 | Run 2 | Run 3 | Paired legacy intervals |')
  lines.push('|---|---:|---|---|---|---|')
  for (const row of report.rows) {
    const runs = row.runs.dataCoreV3.map((run: any) => formatRun(run))
    const intervals = row.speedups.dataCoreV3VsLegacyIntervals.map(formatRange).join('; ')
    lines.push(`| ${row.scenarioId} | ${row.dimensions.items} | ${runs[0]} | ${runs[1]} | ${runs[2]} | ${intervals} |`)
  }
  lines.push('', '## Residual interpretation', '')
  lines.push(renderResidual('Legacy acceptance failures', report.residualRegressions.versusLegacy))
  lines.push(renderResidual('Clear v3 regressions versus v2', report.residualRegressions.versusV2))
  lines.push(renderResidual('Clear v3 regressions versus v1', report.residualRegressions.versusV1))
  for (const row of report.residualRegressions.v1PointEstimatesBelowParity) {
    lines.push(`- V1 point estimate ${row.scenarioId} (${row.dimensions.items}): v1 ${format(row.dataCoreV1Microseconds)} µs, v3 ${format(row.dataCoreV3Microseconds)} µs, normalized ratio ${format(row.normalizedRatio)}, confidence ${formatRange(row.confidenceEnvelope)}. ${row.strongerSemanticCost}`)
  }
  if (report.cpuProfileEvidence) {
    lines.push(`- CPU profile ${report.cpuProfileEvidence.profile}: ${report.cpuProfileEvidence.interpretation}`)
    lines.push(`- Hydration self samples: ${Object.entries(report.cpuProfileEvidence.hydrationSelfSamples).map(([name, samples]) => `${name}=${samples}`).join(', ')}.`)
  }
  lines.push('', 'Detailed implementation means, throughput, RME, samples, batch sizes, reruns, reactive counts, and intervals remain machine-readable in companion JSON.', '')
  return lines.join('\n')
}

/** Render one candidate measurement compactly. */
function formatRun(run: any): string {
  const value = run.implementations.engine
  return `${format(value.meanMicroseconds)} µs; ${Math.round(value.operationsPerSecond)} ops/s; RME ${format(value.rme)}%; n=${value.samples}; retry=${run.reruns}`
}

/** Render compact list of residual row identities. */
function renderResidual(label: string, rows: readonly any[]): string {
  if (!rows.length)
    return `- ${label}: none.`
  return `- ${label}: ${rows.map(row => `${row.scenarioId} (${row.dimensions.items})`).join(', ')}.`
}

/** Render one numeric interval. */
function formatRange(values: readonly number[]): string {
  return `${format(values[0])}–${format(values[1])}`
}

/** Render benchmark values without meaningless trailing precision. */
function format(value: number): string {
  return Number(value).toFixed(value >= 100 ? 1 : value >= 10 ? 2 : 3)
}
