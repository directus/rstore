import type { CollectionDefaults, HookDefinitions, Hooks, StoreSchema } from '@rstore/shared'

/**
 * Dispatch diagnostics independently: one observer fault cannot hide another
 * observer's terminal event or replace the original application rejection.
 */
export async function reportOperationError<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
  TName extends 'fetchError' | 'mutationError',
>(
  hooks: Hooks<TSchema, TCollectionDefaults>,
  name: TName,
  payload: Parameters<HookDefinitions<TSchema, TCollectionDefaults>[TName]>[0],
): Promise<void> {
  await hooks.callHookWith(name, async (callbacks) => {
    for (const { callback } of callbacks) {
      try {
        // Name and payload share TName; TypeScript widens generic callbacks
        // into a union when iterating the dispatch snapshot.
        const observe = callback as (value: typeof payload) => unknown
        await observe(payload)
      }
      catch {
        // Diagnostic observers do not participate in application error flow.
      }
    }
  })
}

/**
 * Give competing foreground/background branches one failure authority. Claim
 * before awaiting observers so overlapping rejections cannot dispatch twice.
 */
export function createOperationErrorReporter<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
  TName extends 'fetchError' | 'mutationError',
>(
  hooks: Hooks<TSchema, TCollectionDefaults>,
  name: TName,
  payload: Omit<Parameters<HookDefinitions<TSchema, TCollectionDefaults>[TName]>[0], 'error'>,
): (error: unknown) => Promise<void> {
  let reported = false
  return async (error) => {
    if (reported)
      return
    reported = true
    // Omit removes only the mandatory error field; restoring it satisfies the
    // selected hook payload, though generic indexed types cannot infer that.
    await reportOperationError(hooks, name, {
      ...payload,
      error,
    } as Parameters<HookDefinitions<TSchema, TCollectionDefaults>[TName]>[0])
  }
}
