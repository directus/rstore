export class TutorialRuntimeCancellationError extends Error {
  constructor(message = 'The tutorial runtime session was cancelled.') {
    super(message)
    this.name = 'TutorialRuntimeCancellationError'
  }
}

export function isTutorialRuntimeCancellationError(error: unknown): error is TutorialRuntimeCancellationError {
  return error instanceof TutorialRuntimeCancellationError
}

export function createTutorialRuntimeSessionController() {
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
        throw new TutorialRuntimeCancellationError()
      }
    },
  }
}
