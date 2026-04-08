import type {
  TutorialPreviewState,
  TutorialValidationResult,
} from '../utils/types'

const seededTodoTexts = [
  'Draft the collection hooks',
  'Render the normalized list',
  'Wire realtime cache updates',
] as const

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

function requireStore(chapterFile: string | null, state: TutorialPreviewState, message = 'The preview never finished installing rstore in the app.'): TutorialValidationResult | null {
  if (!state.storeReady) {
    return fail(
      message,
      [
        'Make sure the current chapter finishes registering the store before the app mounts.',
        'The preview will not expose the typed store helpers until the tutorial runtime is ready.',
      ],
      chapterFile ? [chapterFile] : [],
    )
  }

  return null
}

function requireList(state: TutorialPreviewState, chapterFile: string | null, _expectedCount = 3, message = 'The preview is not showing the seeded todo list yet.'): TutorialValidationResult | null {
  const todoTexts = state.todoTexts ?? []
  const missingSeededTodos = seededTodoTexts.filter(text => !todoTexts.includes(text))

  if (missingSeededTodos.length) {
    return fail(
      message,
      [
        'The current chapter should render the seeded tutorial todos instead of placeholder content.',
        `Missing seeded todos: ${missingSeededTodos.join(', ')}.`,
        'Check the collection transport or the query code for the current feature.',
      ],
      chapterFile ? [chapterFile] : [],
    )
  }

  return null
}

function requireBooted(state: TutorialPreviewState, summary: string, details: string[] = []): TutorialValidationResult | null {
  if (state.booted) {
    return null
  }

  return fail(summary, details.length
    ? details
    : [
        'Wait for the sandbox preview to finish booting before checking this chapter.',
      ])
}

export {
  fail,
  pass,
  requireBooted,
  requireList,
  requireStore,
  seededTodoTexts,
}
