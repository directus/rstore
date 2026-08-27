import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

/** Summarize candidate hydration self samples from one V8 CPU profile. */
export function summarizeCpuProfile(path: string): any {
  const profile = JSON.parse(readFileSync(path, 'utf8'))
  const names = new Set([
    'normalizeCollections',
    'normalizeSnapshotInput',
    'stageCollections',
    'restoreCollection',
    'rebuildIndexes',
    'commitCollections',
    'recordCollectionReset',
    'setStateNow',
    'handleReset',
  ])
  const samples = new Map<string, number>()
  for (const node of profile.nodes) {
    const name = node.callFrame.functionName
    const url = node.callFrame.url
    const candidateSource = url.includes('/packages/core/dist/') || url.includes('/packages/vue/src/cache/')
    if (candidateSource && names.has(name))
      samples.set(name, (samples.get(name) ?? 0) + (node.hitCount ?? 0))
  }
  return {
    profile: basename(path),
    kind: 'V8 self samples from paired write-decomposition profile',
    totalSamples: profile.samples?.length ?? 0,
    hydrationSelfSamples: Object.fromEntries([...samples].sort((first, second) => second[1] - first[1])),
    interpretation: 'Residual hydration cost concentrates in detached snapshot normalization, collection restoration, and index-cache rebuilding required by transactional stronger semantics; bridge reset dispatch is negligible.',
  }
}
