import { OtTransformConflict, OtValidationError } from './errors.js'

/** Runs `task`; `undefined` instead of an OT conflict or validation error. */
export function attempt<T>(task: () => T): T | undefined {
  try {
    return task()
  }
  catch (error) {
    if (error instanceof OtTransformConflict || error instanceof OtValidationError) {
      return undefined
    }
    throw error
  }
}
