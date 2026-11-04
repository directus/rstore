/** Render v5/v6 CPU evidence snapshot. */
export function renderV6VersionReportMarkdown(report: any): string {
  const misses = report.rows.filter((row: any) => row.acceptance === 'misses target')
  const lines = [
    '# Data Core v5/v6 CPU evidence snapshot',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `- Node: ${report.environment.node}`,
    `- OS: ${report.environment.os ?? `${report.environment.platform}/${report.environment.arch}`}`,
    `- CPU: ${report.environment.cpu ?? 'unknown'}`,
    `- Data Core v5: ${report.versions.dataCoreV5}`,
    `- Data Core v6: ${report.versions.dataCoreV6}`,
    `- Candidate diff SHA-256: ${report.versions.candidateDiffHash}`,
    `- Frozen legacy SHA-256: ${report.versions.legacyHash}`,
    '',
    '## Small-payload guard',
    '',
    `- ${report.acceptance.rowsMeetingTarget}/${report.acceptance.rowCount} rows meet median <=1.05 and conservative all-run <=1.10 limits.`,
    `- Misses: ${misses.length ? misses.map((row: any) => row.scenarioId).join(', ') : 'none'}.`,
    '- Evidence remains informational; no CI performance gate applies.',
    '',
    '| Scenario | Items | v5 us/op | v6 us/op | v6/v5 median | Conservative range | Result |',
    '|---|---:|---:|---:|---:|---:|---|',
  ]
  for (const row of report.rows)
    lines.push(`| ${row.scenarioName} | ${row.dimensions.items} | ${row.medians.dataCoreV5Microseconds.toFixed(3)} | ${row.medians.dataCoreV6Microseconds.toFixed(3)} | ${row.performanceRatio.toFixed(3)}x | ${row.performanceEnvelope[0].toFixed(3)}-${row.performanceEnvelope[1].toFixed(3)}x | ${row.acceptance} |`)
  lines.push('', 'JSON companion retains every raw run, uncertainty fields, dimensions, medians, and envelopes.', '')
  return lines.join('\n')
}
