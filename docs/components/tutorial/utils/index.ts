import type {
  TutorialPreviewState,
  TutorialSnapshot,
  TutorialStep,
  TutorialSupportState,
  TutorialValidationResult,
} from './types'

type FileMap = Record<string, string>

export function normalizeFileContent(content: string): string {
  return content.replace(/\r\n/g, '\n').trimEnd()
}

export function stripIndent(source: string): string {
  const normalized = source.replace(/\r\n/g, '\n').replace(/^\n/, '').replace(/\n\s*$/, '\n')
  const lines = normalized.split('\n')
  const indents = lines
    .filter(line => line.trim().length > 0)
    .map(line => line.match(/^\s*/)?.[0].length ?? 0)

  const minIndent = indents.length ? Math.min(...indents) : 0
  return lines.map(line => line.slice(minIndent)).join('\n')
}

export function createSnapshot(baseFiles: TutorialSnapshot, overrides: TutorialSnapshot = {}): TutorialSnapshot {
  return {
    ...baseFiles,
    ...overrides,
  }
}

export function pickEditableFiles(files: TutorialSnapshot, editableFiles: string[]): TutorialSnapshot {
  return editableFiles.reduce<TutorialSnapshot>((result, filePath) => {
    result[filePath] = files[filePath] ?? ''
    return result
  }, {})
}

export function resetStepFiles(step: TutorialStep): TutorialSnapshot {
  return pickEditableFiles(step.starterFiles, step.editableFiles)
}

export function composeStepSnapshot(step: TutorialStep, userFiles: TutorialSnapshot): TutorialSnapshot {
  return createSnapshot(step.starterFiles, pickEditableFiles(userFiles, step.editableFiles))
}

export function composeVisibleStepSnapshot(step: TutorialStep, userFiles: TutorialSnapshot, filePaths: string[]): TutorialSnapshot {
  return filePaths.reduce<TutorialSnapshot>((result, filePath) => {
    if (filePath in userFiles) {
      result[filePath] = userFiles[filePath] ?? ''
    }
    else if (filePath in step.starterFiles) {
      result[filePath] = step.starterFiles[filePath] ?? ''
    }
    return result
  }, {})
}

export function diffSnapshots(previousSnapshot: TutorialSnapshot, nextSnapshot: TutorialSnapshot) {
  const writes: TutorialSnapshot = {}
  const removals: string[] = []

  for (const [filePath, contents] of Object.entries(nextSnapshot)) {
    if (previousSnapshot[filePath] !== contents) {
      writes[filePath] = contents
    }
  }

  for (const filePath of Object.keys(previousSnapshot)) {
    if (!(filePath in nextSnapshot)) {
      removals.push(filePath)
    }
  }

  return {
    writes,
    removals,
  }
}

export function getDifferingEditableFiles(step: TutorialStep, userFiles: FileMap): string[] {
  return step.editableFiles.filter((filePath) => {
    const current = normalizeFileContent(userFiles[filePath] ?? step.starterFiles[filePath] ?? '')
    const expected = normalizeFileContent(step.solutionFiles[filePath] ?? '')
    return current !== expected
  })
}

export function getPrimaryCorrectionFile(step: TutorialStep, userFiles: FileMap): string | null {
  return getDifferingEditableFiles(step, userFiles)[0] ?? null
}

export function applyStepCorrections(step: TutorialStep, userFiles: FileMap): TutorialSnapshot {
  const nextFiles = {
    ...userFiles,
  }

  for (const filePath of step.editableFiles) {
    nextFiles[filePath] = step.solutionFiles[filePath] ?? ''
  }

  return nextFiles
}

export function mergeTutorialOpenFiles(openFiles: string[], nextFiles: string[]): string[] {
  const mergedFiles = [...openFiles]
  const seenFiles = new Set(openFiles)

  for (const filePath of nextFiles) {
    if (seenFiles.has(filePath))
      continue

    seenFiles.add(filePath)
    mergedFiles.push(filePath)
  }

  return mergedFiles
}

export function prioritizeTutorialOpenFiles(openFiles: string[], priorityFiles: string[]): string[] {
  const prioritized = new Set(priorityFiles)

  return [
    ...openFiles.filter(filePath => prioritized.has(filePath)),
    ...openFiles.filter(filePath => !prioritized.has(filePath)),
  ]
}

export function validateStep(step: TutorialStep, previewState: TutorialPreviewState): TutorialValidationResult {
  return step.validator(previewState)
}

export function detectTutorialSupport(target: Partial<Window> & typeof globalThis): TutorialSupportState {
  if (typeof target.window === 'undefined') {
    return {
      supported: false,
      reason: 'The interactive tutorial only runs in a browser.',
      needsCrossOriginIsolation: false,
    }
  }

  if (typeof target.SharedArrayBuffer === 'undefined') {
    return {
      supported: false,
      reason: 'This browser does not expose SharedArrayBuffer, which WebContainers require.',
      needsCrossOriginIsolation: false,
    }
  }

  if (!target.crossOriginIsolated) {
    return {
      supported: false,
      reason: 'Cross-origin isolation is not enabled for this page.',
      needsCrossOriginIsolation: true,
    }
  }

  return {
    supported: true,
    reason: null,
    needsCrossOriginIsolation: false,
  }
}

export function createPendingValidation(summary: string, failingFiles: string[] = []): TutorialValidationResult {
  return {
    ok: false,
    summary,
    details: [],
    failingFiles,
  }
}
