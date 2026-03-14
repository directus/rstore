import type { Component } from 'vue'

export type TutorialGroup = 'Core' | 'Modeling' | 'Reactivity'

export type TutorialSnapshot = Record<string, string>

export interface TutorialPreviewState {
  booted?: boolean
  storeReady?: boolean
  transportMode?: 'hooks' | 'plugin'
  lastError?: string
  listCount?: number
  todoTexts?: string[]
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

export interface TutorialStepDefinition {
  id: string
  title: string
  feature: string
  group: TutorialGroup
  referenceLinks: TutorialDocLink[]
  editableFiles: string[]
  validationAction?: string
  validator: TutorialValidator
}

export interface TutorialStep extends TutorialStepDefinition {
  folder: string
  starterFiles: TutorialSnapshot
  solutionFiles: TutorialSnapshot
  guideComponent: Component
}

export interface TutorialGroupedStep {
  index: number
  step: TutorialStep
}

export interface TutorialStepGroup {
  group: TutorialGroup
  steps: TutorialGroupedStep[]
}

export interface TutorialSupportState {
  supported: boolean
  reason: string | null
  needsCrossOriginIsolation: boolean
}
