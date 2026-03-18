import type { Component } from 'vue'

export type TutorialFramework = 'vue' | 'nuxt'

export type TutorialGroup = string

export interface TutorialTrackDefinition {
  framework: TutorialFramework
  label: string
  description: string
  imageSrc: string
  runtimePort: number
}

export interface TutorialTrackContent extends TutorialTrackDefinition {
  chapters: TutorialChapter[]
}

export interface TutorialTrackSummary extends TutorialTrackDefinition {
  chapterCount: number
}

export type TutorialSnapshot = Record<string, string>

export interface TutorialPreviewState {
  booted?: boolean
  storeReady?: boolean
  transportMode?: 'hooks' | 'plugin'
  lastError?: string
  listCount?: number
  todoTexts?: string[]
  query?: {
    refreshWorked?: boolean
  }
  mutation?: {
    created?: boolean
    toggled?: boolean
    deleted?: boolean
  }
  form?: {
    ready?: boolean
    created?: boolean
    updated?: boolean
    resetWorked?: boolean
    valid?: boolean
    hasChanges?: boolean
  }
  relations?: {
    assigneeNames?: string[]
  }
  live?: {
    total?: number
    remoteInsertSeen?: boolean
  }
  cache?: {
    count?: number
    injected?: boolean
    cleared?: boolean
  }
}

export interface TutorialValidationResult {
  ok: boolean
  summary: string
  details: string[]
  failingFiles?: string[]
}

export type TutorialValidator = (state: TutorialPreviewState) => TutorialValidationResult

export interface TutorialDocLink {
  label: string
  href: string
}

export interface TutorialChapterDefinition {
  id: string
  framework: TutorialFramework
  slug: string
  folder?: string
  title: string
  feature: string
  group: TutorialGroup
  referenceLinks: TutorialDocLink[]
  editableFiles: string[]
  validationAction?: string
  validator: TutorialValidator
}

export interface TutorialChapter extends TutorialChapterDefinition {
  folder: string
  starterFiles: TutorialSnapshot
  solutionFiles: TutorialSnapshot
  guideComponent: Component
  guideSearchText: string
}

export interface TutorialGroupedChapter {
  index: number
  chapter: TutorialChapter
}

export interface TutorialChapterGroup {
  group: TutorialGroup
  chapters: TutorialGroupedChapter[]
}

export interface TutorialAdjacentChapter {
  index: number
  chapter: TutorialChapter
}

export interface TutorialSupportState {
  supported: boolean
  reason: string | null
  needsCrossOriginIsolation: boolean
}

export interface TutorialSearchTextSegment {
  text: string
  highlighted: boolean
}

export interface TutorialSearchSnippet {
  leadingEllipsis: boolean
  trailingEllipsis: boolean
  segments: TutorialSearchTextSegment[]
}

export interface TutorialFileVisual {
  icon: string
  iconClass: string
}

export interface TutorialFileTreeFileNode {
  type: 'file'
  name: string
  path: string
  editable: boolean
  icon: TutorialFileVisual['icon']
  iconClass: TutorialFileVisual['iconClass']
}

export interface TutorialFileTreeFolderNode {
  type: 'folder'
  name: string
  path: string
  children: TutorialFileTreeNode[]
}

export type TutorialFileTreeNode = TutorialFileTreeFileNode | TutorialFileTreeFolderNode

export interface TutorialFileTreeData {
  nodes: TutorialFileTreeNode[]
  folderPaths: string[]
  selectedAncestorPaths: string[]
}

export type TutorialStepDefinition = TutorialChapterDefinition
export type TutorialStep = TutorialChapter
export type TutorialGroupedStep = TutorialGroupedChapter
export type TutorialStepGroup = TutorialChapterGroup
