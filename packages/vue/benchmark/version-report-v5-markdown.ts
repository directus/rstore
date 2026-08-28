import { format, formatChange, formatComparison, formatRange, formatRun, renderResidual } from './version-report-v4-markdown'

/** Render legacy/v1-v2-v3-v4/v5 performance evidence snapshot. */
export function renderV5VersionReportMarkdown(report: any): string {
  const quality = report.runQuality.dataCoreV5
  const lines = [
    '# Data Core v1/v2/v3/v4/v5 performance evidence snapshot',
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
    `- Data Core v5: ${report.versions.dataCoreV5}`,
    `- Candidate diff SHA-256: ${report.versions.candidateDiffHash}`,
    '',
    '## Acceptance summary',
    '',
    ...quality.map((run: any, index: number) => `- Run ${index + 1}: ${run.classification.faster}/59 engine faster, ${run.classification.slower} legacy faster, ${run.classification.noClearDifference} no clear difference, ${run.classification.noisy} noisy; max RME ${format(run.maxRme)}%; retries ${run.reruns}.`),
    `- CPU target: ${report.performanceTarget.rowsMeetingTarget}/${report.performanceTarget.rowCount} rows meet median <=10% and conservative all-run <=15% slowdown versus same-machine v4.`,
    `- Typical v5 throughput change versus v4: ${formatChange(report.geometricMeans.dataCoreV5VsV4)}.`,
    `- Typical v5 throughput gain versus v3: ${formatChange(report.geometricMeans.dataCoreV5VsV3)}.`,
    `- Clear v5 regressions versus v4: ${report.residualRegressions.versusV4.length}.`,
    `- Cache ownership: ${report.cacheBounds.indexResultEntries} weak index results, at most ${report.cacheBounds.indexResultStrongWrapperReferences} strongly cached hot wrapper references, zero orphan signals.`,
    '- Evidence snapshot remains informational; no CI performance gate applies.',
    '',
    '## How to read comparisons',
    '',
    '- Each Data Core version is normalized by legacy measured beside it before cross-version comparison.',
    '- Direct target uses engine duration: lower is faster. Version comparison cells use throughput: higher is faster.',
    '- Conservative envelope includes every candidate/baseline run pairing.',
    '- RME is benchmark uncertainty. Companion JSON retains raw runs, ratios, counts, retries, and intervals.',
    '',
    '## All benchmark rows',
    '',
    '| Scenario | Items | Legacy µs | v1 µs | v2 µs | v3 µs | v4 µs | v5 µs | v5/v4 duration | CPU target | v5 vs legacy | v5 vs v4 throughput |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|',
  ]
  for (const row of report.rows) {
    lines.push(`| ${row.scenarioName} | ${row.dimensions.items} | ${format(row.medians.legacyMicroseconds)} | ${format(row.medians.dataCoreV1Microseconds)} | ${format(row.medians.dataCoreV2Microseconds)} | ${format(row.medians.dataCoreV3Microseconds)} | ${format(row.medians.dataCoreV4Microseconds)} | ${format(row.medians.dataCoreV5Microseconds)} | ${format(row.performanceRatio)} [${formatRange(row.performanceEnvelope)}] | ${row.performanceTarget} | ${formatRange(row.speedups.dataCoreV5VsLegacyRange)}x faster | ${formatComparison(row.speedups.dataCoreV5VsV4, row.speedups.dataCoreV5VsV4ConfidenceEnvelope)} |`)
  }
  lines.push('', '## Data Core v5 per-run evidence', '')
  lines.push('| Scenario | Items | Run 1 | Run 2 | Run 3 | Paired legacy intervals |')
  lines.push('|---|---:|---|---|---|---|')
  for (const row of report.rows) {
    const runs = row.runs.dataCoreV5.map(formatRun)
    const intervals = row.speedups.dataCoreV5VsLegacyIntervals.map(formatRange).join('; ')
    lines.push(`| ${row.scenarioId} | ${row.dimensions.items} | ${runs[0]} | ${runs[1]} | ${runs[2]} | ${intervals} |`)
  }
  lines.push('', '## Residual interpretation', '')
  lines.push(renderResidual('Rows missing direct v4 CPU target', report.rows.filter((row: any) => row.performanceTarget !== 'meets target')))
  lines.push(renderResidual('Legacy acceptance failures', report.residualRegressions.versusLegacy))
  lines.push(renderResidual('Clear v5 regressions versus v4', report.residualRegressions.versusV4))
  lines.push('', 'Detailed means, throughput, RME, samples, batch sizes, retries, reactive counts, and intervals remain in companion JSON.', '')
  return lines.join('\n')
}
