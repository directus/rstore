import type {
  TutorialAdjacentChapter,
  TutorialChapter,
  TutorialChapterGroup,
  TutorialFileTreeData,
  TutorialFileTreeNode,
  TutorialFileVisual,
  TutorialGroup,
  TutorialPreviewState,
  TutorialSearchSnippet,
  TutorialSearchTextSegment,
  TutorialSnapshot,
  TutorialSupportState,
  TutorialValidationResult,
} from './types'

type FileMap = Record<string, string>
const tutorialSourceExtensions = ['.vue', '.ts', '.js', '.mjs', '.tsx', '.jsx']

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

export function resetStepFiles(chapter: TutorialChapter): TutorialSnapshot {
  return pickEditableFiles(chapter.starterFiles, chapter.editableFiles)
}

export function composeStepSnapshot(chapter: TutorialChapter, userFiles: TutorialSnapshot): TutorialSnapshot {
  return createSnapshot(chapter.starterFiles, pickEditableFiles(userFiles, chapter.editableFiles))
}

export function composeVisibleStepSnapshot(chapter: TutorialChapter, userFiles: TutorialSnapshot, filePaths: string[]): TutorialSnapshot {
  return filePaths.reduce<TutorialSnapshot>((result, filePath) => {
    if (filePath in userFiles) {
      result[filePath] = userFiles[filePath] ?? ''
    }
    else if (filePath in chapter.starterFiles) {
      result[filePath] = chapter.starterFiles[filePath] ?? ''
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

export function getDifferingEditableFiles(chapter: TutorialChapter, userFiles: FileMap): string[] {
  return chapter.editableFiles.filter((filePath) => {
    const current = normalizeFileContent(userFiles[filePath] ?? chapter.starterFiles[filePath] ?? '')
    const expected = normalizeFileContent(chapter.solutionFiles[filePath] ?? '')
    return current !== expected
  })
}

export function getPrimaryCorrectionFile(chapter: TutorialChapter, userFiles: FileMap): string | null {
  return getDifferingEditableFiles(chapter, userFiles)[0] ?? null
}

export function applyStepCorrections(chapter: TutorialChapter, userFiles: FileMap): TutorialSnapshot {
  const nextFiles = {
    ...userFiles,
  }

  for (const filePath of chapter.editableFiles) {
    nextFiles[filePath] = chapter.solutionFiles[filePath] ?? ''
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

function getTutorialFileIcon(filePath: string) {
  if (filePath.endsWith('.vue')) {
    return 'file-icons:vue'
  }

  if (filePath.endsWith('.tsx')) {
    return 'file-icons:tsx'
  }

  if (filePath.endsWith('.ts')) {
    return 'file-icons:typescript'
  }

  if (filePath.endsWith('.jsx')) {
    return 'file-icons:jsx'
  }

  if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
    return 'file-icons:config-js'
  }

  return 'file-icons:default'
}

function getTutorialFileIconClass(filePath: string) {
  if (filePath.endsWith('.vue')) {
    return 'text-emerald-500 dark:text-emerald-400'
  }

  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    return 'text-sky-500 dark:text-sky-400'
  }

  if (filePath.endsWith('.jsx') || filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
    return 'text-amber-500 dark:text-amber-400'
  }

  return 'text-zinc-500 dark:text-zinc-400'
}

export function getTutorialFileVisual(filePath: string | null): TutorialFileVisual | null {
  if (!filePath) {
    return null
  }

  return {
    icon: getTutorialFileIcon(filePath),
    iconClass: getTutorialFileIconClass(filePath),
  }
}

interface TutorialFileTreeDraftFolder {
  type: 'folder'
  name: string
  path: string
  folders: Map<string, TutorialFileTreeDraftFolder>
  files: TutorialFileTreeNode[]
}

function createTutorialFileTreeDraftFolder(name: string, path: string): TutorialFileTreeDraftFolder {
  return {
    type: 'folder',
    name,
    path,
    folders: new Map(),
    files: [],
  }
}

function finalizeTutorialFileTreeFolder(folder: TutorialFileTreeDraftFolder, folderPaths: string[]): TutorialFileTreeNode[] {
  const childFolders = [...folder.folders.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((childFolder) => {
      if (childFolder.path) {
        folderPaths.push(childFolder.path)
      }

      return {
        type: 'folder' as const,
        name: childFolder.name,
        path: childFolder.path,
        children: finalizeTutorialFileTreeFolder(childFolder, folderPaths),
      }
    })

  return [
    ...childFolders,
    ...folder.files,
  ]
}

export function buildTutorialFileTree(openFiles: string[], editableFiles: string[], selectedFile: string | null): TutorialFileTreeData {
  const editableFileSet = new Set(editableFiles)
  const rootFolder = createTutorialFileTreeDraftFolder('', '')

  for (const filePath of openFiles) {
    const segments = filePath.split('/')
    let currentFolder = rootFolder

    for (const [index, segment] of segments.entries()) {
      const path = segments.slice(0, index + 1).join('/')

      if (index === segments.length - 1) {
        const fileVisual = getTutorialFileVisual(filePath)!

        currentFolder.files.push({
          type: 'file',
          name: segment,
          path: filePath,
          editable: editableFileSet.has(filePath),
          icon: fileVisual.icon,
          iconClass: fileVisual.iconClass,
        })
        continue
      }

      let nextFolder = currentFolder.folders.get(segment)

      if (!nextFolder) {
        nextFolder = createTutorialFileTreeDraftFolder(segment, path)
        currentFolder.folders.set(segment, nextFolder)
      }

      currentFolder = nextFolder
    }
  }

  const folderPaths: string[] = []
  const selectedAncestorPaths = selectedFile
    ? selectedFile
        .split('/')
        .slice(0, -1)
        .map((_, index, segments) => segments.slice(0, index + 1).join('/'))
    : []

  return {
    nodes: finalizeTutorialFileTreeFolder(rootFolder, folderPaths),
    folderPaths,
    selectedAncestorPaths,
  }
}

export function resolveTutorialSelectedFile(selectedFile: string | null, editorFiles: string[], editableFiles: string[]): string | null {
  if (selectedFile && editorFiles.includes(selectedFile)) {
    return selectedFile
  }

  return editableFiles[0] ?? editorFiles[0] ?? null
}

export function resolveTutorialChapterSelectedFile(
  chapterId: string,
  selectedFilesByChapter: Record<string, string | null>,
  editorFiles: string[],
  editableFiles: string[],
): string | null {
  return resolveTutorialSelectedFile(
    selectedFilesByChapter[chapterId] ?? null,
    editorFiles,
    editableFiles,
  )
}

function isTutorialSourceFile(filePath: string) {
  if (!filePath.startsWith('src/')) {
    return false
  }

  if (
    filePath === 'src/env.d.ts'
    || filePath.startsWith('src/tutorial/')
    || filePath.endsWith('.css')
  ) {
    return false
  }

  return tutorialSourceExtensions.some(extension => filePath.endsWith(extension))
}

function extractRelativeImports(source: string): string[] {
  const imports = new Set<string>()
  const patterns = [
    /(?:import|export)\s[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]

  for (const pattern of patterns) {
    let match = pattern.exec(source)

    while (match) {
      const specifier = match[1]

      if (specifier?.startsWith('.')) {
        imports.add(specifier)
      }

      match = pattern.exec(source)
    }
  }

  return [...imports]
}

function normalizeTutorialPath(path: string) {
  const segments = path.split('/')
  const normalized: string[] = []

  for (const segment of segments) {
    if (!segment || segment === '.') {
      continue
    }

    if (segment === '..') {
      normalized.pop()
      continue
    }

    normalized.push(segment)
  }

  return normalized.join('/')
}

function resolveTutorialImport(filePath: string, specifier: string, availableFiles: Set<string>) {
  const baseSegments = filePath.split('/').slice(0, -1)
  const basePath = normalizeTutorialPath([...baseSegments, specifier].join('/'))
  const candidates = [
    basePath,
    ...tutorialSourceExtensions.map(extension => `${basePath}${extension}`),
    ...tutorialSourceExtensions.map(extension => `${basePath}/index${extension}`),
  ]

  return candidates.find(candidate => availableFiles.has(candidate)) ?? null
}

export function getTutorialChapterEditorFiles(chapter: TutorialChapter): string[] {
  const sourceFiles = Object.keys(chapter.starterFiles)
    .filter(isTutorialSourceFile)
    .sort((a, b) => a.localeCompare(b))
  const sourceFileSet = new Set(sourceFiles)
  const importedFiles = new Map<string, Set<string>>()
  const importerFiles = new Map<string, Set<string>>()

  for (const filePath of sourceFiles) {
    importedFiles.set(filePath, new Set())
    importerFiles.set(filePath, new Set())
  }

  for (const filePath of sourceFiles) {
    const source = chapter.starterFiles[filePath] ?? ''

    for (const specifier of extractRelativeImports(source)) {
      const resolvedImport = resolveTutorialImport(filePath, specifier, sourceFileSet)

      if (!resolvedImport)
        continue

      importedFiles.get(filePath)?.add(resolvedImport)
      importerFiles.get(resolvedImport)?.add(filePath)
    }
  }

  const distances = new Map<string, number>()
  const editableSourceFiles = chapter.editableFiles.filter(filePath => sourceFileSet.has(filePath))

  function collectDistances(edges: Map<string, Set<string>>) {
    const branchDistances = new Map<string, number>()
    const queue = [...editableSourceFiles]

    for (const filePath of queue) {
      branchDistances.set(filePath, 0)
    }

    while (queue.length) {
      const filePath = queue.shift()!
      const distance = branchDistances.get(filePath) ?? 0

      for (const relatedFile of edges.get(filePath) ?? []) {
        if (branchDistances.has(relatedFile))
          continue

        branchDistances.set(relatedFile, distance + 1)
        queue.push(relatedFile)
      }
    }

    for (const [filePath, distance] of branchDistances) {
      const previousDistance = distances.get(filePath)

      if (previousDistance == null || distance < previousDistance) {
        distances.set(filePath, distance)
      }
    }
  }

  collectDistances(importedFiles)
  collectDistances(importerFiles)

  const readonlyContextFiles = sourceFiles
    .filter(filePath => !chapter.editableFiles.includes(filePath) && distances.has(filePath))
    .sort((a, b) => {
      const distanceDiff = (distances.get(a) ?? Number.MAX_SAFE_INTEGER) - (distances.get(b) ?? Number.MAX_SAFE_INTEGER)
      return distanceDiff || a.localeCompare(b)
    })

  return [
    ...chapter.editableFiles,
    ...readonlyContextFiles,
  ]
}

export function validateStep(chapter: TutorialChapter, previewState: TutorialPreviewState): TutorialValidationResult {
  return chapter.validator(previewState)
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

export function groupTutorialChapters(chapters: TutorialChapter[]): TutorialChapterGroup[] {
  const groups: TutorialChapterGroup[] = []
  const groupLookup = new Map<TutorialGroup, TutorialChapterGroup>()

  chapters.forEach((chapter, index) => {
    let group = groupLookup.get(chapter.group)

    if (!group) {
      group = {
        group: chapter.group,
        chapters: [],
      }
      groupLookup.set(chapter.group, group)
      groups.push(group)
    }

    group.chapters.push({
      index,
      chapter,
    })
  })

  return groups
}

export function getAdjacentTutorialChapters(
  chapters: TutorialChapter[],
  activeChapterIndex: number,
): { previous: TutorialAdjacentChapter | null, next: TutorialAdjacentChapter | null } {
  return {
    previous: activeChapterIndex > 0
      ? {
          index: activeChapterIndex - 1,
          chapter: chapters[activeChapterIndex - 1]!,
        }
      : null,
    next: activeChapterIndex < chapters.length - 1
      ? {
          index: activeChapterIndex + 1,
          chapter: chapters[activeChapterIndex + 1]!,
        }
      : null,
  }
}

type TutorialMatchRange = readonly [number, number]

export function normalizeTutorialGuideSearchText(markdown: string): string {
  return markdown
    .replace(/^\s*---[\t ]*\r?\n[\s\S]*?\r?\n---[\t ]*\r?\n?/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .split(/\r?\n/)
    .map(line => line
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s*>\s?/, '')
      .replace(/^\s*(?:[-*+]|\d+\.)\s+/, '')
      .replace(/[*_~]+/g, '')
      .trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeTutorialMatchRanges(text: string, indices: ReadonlyArray<TutorialMatchRange>): TutorialMatchRange[] {
  if (!text.length || !indices.length)
    return []

  const maxIndex = text.length - 1
  const sortedRanges = indices
    .map(([start, end]) => [
      Math.max(0, Math.min(start, maxIndex)),
      Math.max(0, Math.min(end, maxIndex)),
    ] as const)
    .filter(([start, end]) => start <= end)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])

  const mergedRanges: TutorialMatchRange[] = []

  for (const range of sortedRanges) {
    const lastRange = mergedRanges[mergedRanges.length - 1]

    if (!lastRange || range[0] > lastRange[1] + 1) {
      mergedRanges.push(range)
      continue
    }

    mergedRanges[mergedRanges.length - 1] = [lastRange[0], Math.max(lastRange[1], range[1])]
  }

  return mergedRanges
}

export function createTutorialSearchSegments(
  text: string,
  indices: ReadonlyArray<TutorialMatchRange> = [],
): TutorialSearchTextSegment[] {
  const ranges = normalizeTutorialMatchRanges(text, indices)

  if (!ranges.length)
    return text ? [{ text, highlighted: false }] : []

  const segments: TutorialSearchTextSegment[] = []
  let cursor = 0

  for (const [start, end] of ranges) {
    // Skip 1 cahrs ranges
    if (start === end) {
      continue
    }

    if (start > cursor) {
      segments.push({
        text: text.slice(cursor, start),
        highlighted: false,
      })
    }

    segments.push({
      text: text.slice(start, end + 1),
      highlighted: true,
    })

    cursor = end + 1
  }

  if (cursor < text.length) {
    segments.push({
      text: text.slice(cursor),
      highlighted: false,
    })
  }

  return segments.filter(segment => segment.text.length > 0)
}

export function createTutorialSearchSnippet(
  text: string,
  indices: ReadonlyArray<TutorialMatchRange>,
  options: { contextChars?: number, maxMatches?: number } = {},
): TutorialSearchSnippet | null {
  const ranges = normalizeTutorialMatchRanges(text, indices)

  if (!ranges.length)
    return null

  const contextChars = options.contextChars ?? 48
  const maxMatches = options.maxMatches ?? 2
  const clippedRanges = ranges
    .slice(0, maxMatches)
    .map(([start, end]) => [
      Math.max(0, start - contextChars),
      Math.min(text.length - 1, end + contextChars),
    ] as const)

  const windowRanges = normalizeTutorialMatchRanges(text, clippedRanges)

  if (!windowRanges.length)
    return null

  const segments: TutorialSearchTextSegment[] = []

  windowRanges.forEach(([start, end], index) => {
    if (index > 0) {
      segments.push({
        text: ' ... ',
        highlighted: false,
      })
    }

    segments.push(...createTutorialSearchSegments(text.slice(start, end + 1), ranges
      .filter(([matchStart, matchEnd]) => matchEnd >= start && matchStart <= end)
      .map(([matchStart, matchEnd]) => [
        Math.max(matchStart, start) - start,
        Math.min(matchEnd, end) - start,
      ] as const)))
  })

  return {
    leadingEllipsis: windowRanges[0]![0] > 0,
    trailingEllipsis: windowRanges[windowRanges.length - 1]![1] < text.length - 1,
    segments: segments.filter(segment => segment.text.length > 0),
  }
}

export function createLatestRequestController() {
  let activeToken = 0

  return {
    issue() {
      activeToken += 1
      return activeToken
    },
    isCurrent(token: number) {
      return token === activeToken
    },
  }
}
