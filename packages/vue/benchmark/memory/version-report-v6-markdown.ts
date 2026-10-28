/** Render v5/v6 retained-memory evidence snapshot. */
export function renderMemoryV6Markdown(report: any): string {
  const lines = [
    '# Data Core v5/v6 retained-memory evidence snapshot',
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
    '## Summary',
    '',
    `- Setup guard: ${report.acceptance.setupRowsMeetingGuard}/${report.acceptance.rowCount} rows meet target.`,
    `- Steady guard: ${report.acceptance.steadyRowsMeetingGuard}/${report.acceptance.rowCount} rows meet target.`,
    `- New repeatable retained-growth signals: ${report.acceptance.newGrowthSignals.length ? report.acceptance.newGrowthSignals.join(', ') : 'none'}.`,
    '- Evidence remains informational; no CI memory gate applies.',
    '',
    '| Scenario | Items | v5 setup MiB | v6 setup MiB | Setup result | v5 steady MiB | v6 steady MiB | Steady result | v6 growth KiB | Growth signal | v6 teardown KiB |',
    '|---|---:|---:|---:|---|---:|---:|---|---:|---|---:|',
  ]
  for (const row of report.rows) {
    const v5 = row.summaries.dataCoreV5
    const v6 = row.summaries.dataCoreV6
    lines.push(`| ${row.scenarioName} | ${row.dimensions.items} | ${mib(v5.setupRetainedBytes.median)} | ${mib(v6.setupRetainedBytes.median)} | ${row.guards.setup ? 'meets target' : 'misses target'} | ${mib(v5.steadyRetainedBytes.median)} | ${mib(v6.steadyRetainedBytes.median)} | ${row.guards.steady ? 'meets target' : 'misses target'} | ${kib(v6.growthBytes.median)} | ${row.growthSignals.dataCoreV6} | ${kib(v6.teardownResidualBytes.median)} |`)
  }
  lines.push(
    '',
    '## Interpretation',
    '',
    '- Setup and steady heap represent expected retained state before teardown.',
    '- Growth remains signed; repeatable signal requires all runs above matching empty-control envelope.',
    '- Inconclusive means forced-GC noise overlaps control, not demonstrated improvement or regression.',
    '- Teardown residual remains signed state after complete disposal.',
    '',
  )
  return lines.join('\n')
}

/** Format bytes as MiB. */
function mib(value: number): string {
  return (value / 1024 / 1024).toFixed(3)
}

/** Format bytes as KiB. */
function kib(value: number): string {
  return (value / 1024).toFixed(2)
}
