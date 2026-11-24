/** Append one synchronization failure, flattening nested aggregate errors. */
export function appendSyncError(errors: unknown[] | undefined, error: unknown): unknown[] {
  const target = errors ?? []
  target.push(...error instanceof AggregateError ? error.errors : [error])
  return target
}

/** Execute one synchronization task without starving later tasks after failure. */
export function runSyncTask(callback: () => void, errors: unknown[] | undefined): unknown[] | undefined {
  try {
    callback()
  }
  catch (error) {
    return appendSyncError(errors, error)
  }
  return errors
}

/** Preserve one original failure or combine several independent failures. */
export function throwSyncErrors(errors: readonly unknown[] | undefined, message: string): void {
  if (errors?.length === 1)
    throw errors[0]
  if (errors?.length)
    throw new AggregateError(errors, message)
}
