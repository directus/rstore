/** Render legacy/v1/v2/v3/v4 report and complete v4 run evidence. */
export function renderV4VersionReportMarkdown(report: any): string {
  const quality = report.runQuality.dataCoreV4
  const lines = [
    '# Data Core v1/v2/v3/v4 performance report',
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
    `- Data Core v2: ${report.versions.dataCoreV2}`,
    `- Data Core v3: ${report.versions.dataCoreV3}`,
    `- Data Core v4: ${report.versions.dataCoreV4}`,
    `- Candidate diff SHA-256: ${report.versions.candidateDiffHash}`,
    '',
    '## Acceptance summary',
    '',
    ...quality.map((run: any, index: number) => `- Run ${index + 1}: ${run.classification.faster}/59 engine faster, ${run.classification.slower} legacy faster, ${run.classification.noClearDifference} no clear difference, ${run.classification.noisy} noisy; max RME ${format(run.maxRme)}%; retries ${run.reruns}.`),
    `- Typical v4 throughput gain versus v3: ${formatChange(report.geometricMeans.dataCoreV4VsV3)}.`,
    `- Typical v4 throughput gain versus v2: ${formatChange(report.geometricMeans.dataCoreV4VsV2)}.`,
    `- Typical v4 throughput gain versus v1: ${formatChange(report.geometricMeans.dataCoreV4VsV1)}.`,
    `- Clear v4 regressions versus v3: ${report.residualRegressions.versusV3.length}.`,
    `- Clear v4 regressions versus v2: ${report.residualRegressions.versusV2.length}.`,
    `- Clear v4 regressions versus v1: ${report.residualRegressions.versusV1.length}.`,
    `- Cache bounds: ${report.cacheBounds.indexResultEntries} index results, ${report.cacheBounds.indexResultWrapperReferences} wrapper references, ${report.cacheBounds.orphanSignals} orphan signals.`,
    '',
    '## How to read comparisons',
    '',
    '- Each Data Core version is first compared with legacy measured beside it, then versions are compared. This reduces machine and run drift.',
    '- Version cells show typical throughput change, followed by conservative plausible range including run variation and measurement uncertainty.',
    '- `faster` means v4 completes more operations per second. `slower` means fewer operations per second.',
    '- If plausible range includes both faster and slower outcomes, result says `unclear`.',
    '- RME is benchmark uncertainty. Lower is better; configured limit is 3%.',
    '- Companion JSON retains exact ratios and confidence values for automated analysis.',
    '',
    '## All 59 benchmark rows',
    '',
    '| Scenario | Items | Legacy µs | v1 µs | v2 µs | v3 µs | v4 µs | v4 vs legacy across runs | v4 vs v3 | v4 vs v2 | v4 vs v1 |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ]
  for (const row of report.rows) {
    lines.push(`| ${row.scenarioName} | ${row.dimensions.items} | ${format(row.medians.legacyMicroseconds)} | ${format(row.medians.dataCoreV1Microseconds)} | ${format(row.medians.dataCoreV2Microseconds)} | ${format(row.medians.dataCoreV3Microseconds)} | ${format(row.medians.dataCoreV4Microseconds)} | ${formatRange(row.speedups.dataCoreV4VsLegacyRange)}× faster | ${formatComparison(row.speedups.dataCoreV4VsV3, row.speedups.dataCoreV4VsV3ConfidenceEnvelope)} | ${formatComparison(row.speedups.dataCoreV4VsV2, row.speedups.dataCoreV4VsV2ConfidenceEnvelope)} | ${formatComparison(row.speedups.dataCoreV4VsV1, row.speedups.dataCoreV4VsV1ConfidenceEnvelope)} |`)
  }
  lines.push('', '## Data Core v4 per-run evidence', '')
  lines.push('| Scenario | Items | Run 1 | Run 2 | Run 3 | Paired legacy intervals |')
  lines.push('|---|---:|---|---|---|---|')
  for (const row of report.rows) {
    const runs = row.runs.dataCoreV4.map(formatRun)
    const intervals = row.speedups.dataCoreV4VsLegacyIntervals.map(formatRange).join('; ')
    lines.push(`| ${row.scenarioId} | ${row.dimensions.items} | ${runs[0]} | ${runs[1]} | ${runs[2]} | ${intervals} |`)
  }
  lines.push('', '## Residual interpretation', '')
  lines.push(renderResidual('Legacy acceptance failures', report.residualRegressions.versusLegacy))
  lines.push(renderResidual('Clear v4 regressions versus v3', report.residualRegressions.versusV3))
  lines.push(renderResidual('Clear v4 regressions versus v2', report.residualRegressions.versusV2))
  lines.push(renderResidual('Clear v4 regressions versus v1', report.residualRegressions.versusV1))
  if (report.cpuProfileEvidence) {
    lines.push(`- CPU profile ${report.cpuProfileEvidence.profile}: ${report.cpuProfileEvidence.interpretation}`)
    lines.push(`- Candidate self samples: ${Object.entries(report.cpuProfileEvidence.topCandidateSelfSamples).map(([name, samples]) => `${name}=${samples}`).join(', ')}.`)
  }
  lines.push('', 'Detailed means, throughput, RME, samples, batch sizes, retries, reactive counts, and intervals remain in companion JSON.', '')
  return lines.join('\n')
}

/** Render one v4 paired measurement. */
export function formatRun(run: any): string {
  const value = run.implementations.engine
  return `${format(value.meanMicroseconds)} µs; ${Math.round(value.operationsPerSecond)} ops/s; RME ${format(value.rme)}%; n=${value.samples}; retry=${run.reruns}`
}

/** Render compact residual identities. */
export function renderResidual(label: string, rows: any[]): string {
  return rows.length
    ? `- ${label}: ${rows.map(row => `${row.scenarioId} (${row.dimensions.items})`).join(', ')}.`
    : `- ${label}: none.`
}

/** Render typical throughput change with conservative uncertainty in plain language. */
export function formatComparison(ratio: number, plausible: readonly [number, number]): string {
  const [lower, upper] = plausible
  if (lower > 1)
    return `${formatChange(ratio)}; plausible ${formatPercent((lower - 1) * 100)}–${formatPercent((upper - 1) * 100)}% faster`
  if (upper < 1)
    return `${formatChange(ratio)}; plausible ${formatPercent((1 - upper) * 100)}–${formatPercent((1 - lower) * 100)}% slower`
  return `${formatChange(ratio)}; unclear (${formatChange(lower)} to ${formatChange(upper)})`
}

/** Render ratio as throughput change relative to baseline. */
export function formatChange(ratio: number): string {
  if (ratio === 1)
    return 'same speed'
  const percent = Math.abs(ratio - 1) * 100
  return `${formatPercent(percent)}% ${ratio > 1 ? 'faster' : 'slower'}`
}

/** Render percentage with useful precision and no trailing zeroes. */
function formatPercent(value: number): string {
  return String(Number(value.toFixed(value >= 10 ? 1 : 2)))
}

/** Render numeric interval. */
export function formatRange(values: readonly [number, number]): string {
  return `${format(values[0])}–${format(values[1])}`
}

/** Render values without meaningless trailing precision. */
export function format(value: number): string {
  return Number(value).toFixed(value >= 100 ? 1 : value >= 10 ? 2 : 3)
}
