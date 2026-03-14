import type {
  TutorialPreviewState,
  TutorialValidationResult,
} from '../utils/types'

function fail(summary: string, details: string[], failingFiles: string[] = []): TutorialValidationResult {
  return {
    ok: false,
    summary,
    details,
    failingFiles,
  }
}

function pass(summary: string, details: string[]): TutorialValidationResult {
  return {
    ok: true,
    summary,
    details,
  }
}

function requireStore(stepFile: string, state: TutorialPreviewState): TutorialValidationResult | null {
  if (!state.storeReady) {
    return fail(
      'The preview never finished installing rstore in the Vue app.',
      [
        'Make sure `createStore()` runs and the Vue app installs `RstorePlugin`.',
        'The preview will not expose `useStore()` until the store plugin is registered.',
      ],
      [stepFile],
    )
  }

  return null
}

function requireList(state: TutorialPreviewState, stepFile: string, expectedCount = 3): TutorialValidationResult | null {
  if (state.listCount !== expectedCount) {
    return fail(
      'The preview is not showing the seeded todo list yet.',
      [
        'The current step should render the three in-memory todos from the tutorial backend.',
        'Check the collection transport or the query code for the current feature.',
      ],
      [stepFile],
    )
  }

  return null
}

export {
  fail,
  pass,
  requireList,
  requireStore,
}
