import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

/** Summarize candidate self samples from one V8 CPU profile. */
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
  const allCandidateSamples = new Map<string, number>()
  for (const node of profile.nodes) {
    const rawName = node.callFrame.functionName
    const name = rawName || '(anonymous)'
    const url = node.callFrame.url
    const candidateSource = url.includes('/packages/core/dist/') || url.includes('/packages/vue/src/cache/')
    if (candidateSource) {
      allCandidateSamples.set(name, (allCandidateSamples.get(name) ?? 0) + (node.hitCount ?? 0))
      if (names.has(rawName))
        samples.set(name, (samples.get(name) ?? 0) + (node.hitCount ?? 0))
    }
  }
  return {
    profile: basename(path),
    kind: 'V8 self samples from engine-only focused profile',
    totalSamples: profile.samples?.length ?? 0,
    hydrationSelfSamples: Object.fromEntries([...samples].sort((first, second) => second[1] - first[1])),
    topCandidateSelfSamples: Object.fromEntries([...allCandidateSamples].sort((first, second) => second[1] - first[1]).slice(0, 12)),
    interpretation: 'Self samples identify remaining candidate-side hot functions without legacy workload pollution.',
  }
}
