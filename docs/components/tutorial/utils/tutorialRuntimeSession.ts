export class TutorialRuntimeCancellationError extends Error {
  constructor(message = 'The tutorial runtime session was cancelled.') {
    super(message)
    this.name = 'TutorialRuntimeCancellationError'
  }
}

export class TutorialChapterTaskCancellationError extends Error {
  constructor(message = 'The tutorial chapter task was cancelled.') {
    super(message)
    this.name = 'TutorialChapterTaskCancellationError'
  }
}

export function isTutorialRuntimeCancellationError(error: unknown): error is TutorialRuntimeCancellationError {
  return error instanceof TutorialRuntimeCancellationError
}

export function isTutorialChapterTaskCancellationError(error: unknown): error is TutorialChapterTaskCancellationError {
  return error instanceof TutorialChapterTaskCancellationError
}

function createTutorialSessionController<TError extends Error>(createError: () => TError) {
  let activeToken = 0

  return {
    get current() {
      return activeToken
    },
    issue() {
      activeToken += 1
      return activeToken
    },
    invalidate() {
      activeToken += 1
      return activeToken
    },
    isCurrent(token: number) {
      return token === activeToken
    },
    throwIfStale(token: number) {
      if (token !== activeToken) {
        throw createError()
      }
    },
  }
}

export function createTutorialRuntimeSessionController() {
  return createTutorialSessionController(() => new TutorialRuntimeCancellationError())
}

export function createTutorialChapterTaskSessionController() {
  return createTutorialSessionController(() => new TutorialChapterTaskCancellationError())
}
