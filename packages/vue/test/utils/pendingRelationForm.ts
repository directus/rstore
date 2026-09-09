import type { FormOperation } from '@rstore/shared'
import { createDeferred } from '#test-utils/deferred'
import { createFormObject } from '@rstore/vue'
import { onTestFinished } from 'vitest'
import { createRelationStack } from './relationStore'

/** Titles of the post rows the pending relation specs share, keyed by row id. */
const postTitles: Record<string, string> = {
  'post-1': 'First',
  'post-2': 'Second',
  'post-3': 'Draft',
}

/** Id of the user row every form of these specs edits. */
const userId = 'user-1'

/** Owner standing for any row the form's user is not related to. */
const otherUserId = 'other'

/**
 * How the fake backend applies a to-many `set` of the relation.
 *
 * `link` only links the rows the operation names, which is what a connector
 * receiving a direct relation payload does. `replace` also unlinks every row
 * the relation currently holds, which is what `$set()` asks for.
 */
export type RelationSetMode = 'link' | 'replace'

/** Options of the held-submit posts form. */
export interface HeldPostsFormOptions {
  /** Backend interpretation of a to-many `set`, `link` by default. */
  setMode?: RelationSetMode
}

/** Rows the fake backend owns, with the author each of them points at. */
type PostOwners = Map<string, string>

/**
 * Return the rows an operation value names, whatever shape it carries.
 */
function operationItems(value: unknown): Record<string, any>[] {
  if (Array.isArray(value))
    return value
  return value && typeof value === 'object' ? [value as Record<string, any>] : []
}

/**
 * Build a user form on the shared relation cache whose first submit is held
 * until the returned gate resolves, and whose acknowledgement applies the
 * operations it was given to the cache, the way a backend owning the
 * `authorId` foreign key would.
 *
 * @param options Backend behaviour the calling spec exercises.
 */
export async function createHeldPostsForm(options: HeldPostsFormOptions = {}) {
  const setMode = options.setMode ?? 'link'
  const gate = createDeferred<void>()
  onTestFinished(() => gate.resolve())
  const stack = await createRelationStack()
  const owners: PostOwners = new Map()

  /**
   * Write one post row with the given owner, as a fetch or a mutation
   * response would.
   *
   * @param id Id of the post row to write.
   * @param authorId Owner the row points at, `user-1` being the form's user.
   */
  const writePost = (id: string, authorId: string) => {
    owners.set(id, authorId)
    stack.write('posts', { id, authorId, title: postTitles[id] })
  }

  /** Unlink every row the backend currently relates to the form's user. */
  const unlinkAll = () => {
    for (const [id, authorId] of [...owners]) {
      if (authorId === userId)
        writePost(id, otherUserId)
    }
  }

  const submitted: Array<{ data: any, operations: FormOperation<any>[] }> = []
  const form = createFormObject({
    defaultValues: () => ({ id: userId, profileId: null as string | null }),
    validateOnSubmit: false,
    submit: async (data, { formOperations }) => {
      submitted.push({ data, operations: formOperations })
      await gate.promise
      applyPostOps({ writePost, unlinkAll, setMode }, formOperations)
    },
    ...stack.formBase,
  }) as any

  return {
    form,
    gate,
    submitted,
    writePost,
    /** Titles of the related rows the form currently shows. */
    titles: () => form.posts.$value.map((item: any) => item.title),
  }
}

/** Options of the held-submit profile form. */
export interface HeldProfileFormOptions {
  /** Foreign key the user row points at before any edit, `null` by default. */
  profileId?: string | null
}

/**
 * Build a user form on the shared relation cache whose to-one `profile`
 * relation starts on the given row, and whose first submit is held until the
 * returned gate resolves.
 *
 * The fake backend owns the user row, so acknowledging a submit saves the
 * foreign key the form sent, the way a connector applying a to-one connect on
 * the source side does.
 *
 * @param options Starting relation of the user row.
 */
export async function createHeldProfileForm(options: HeldProfileFormOptions = {}) {
  const gate = createDeferred<void>()
  onTestFinished(() => gate.resolve())
  const stack = await createRelationStack()
  let saved: Record<string, any> = { id: userId, profileId: options.profileId ?? null }

  const submitted: Array<{ data: any, operations: FormOperation<any>[] }> = []
  const form = createFormObject({
    defaultValues: () => ({ ...saved }),
    validateOnSubmit: false,
    submit: async (data, { formOperations }) => {
      submitted.push({ data, operations: formOperations })
      await gate.promise
      saved = { ...saved, ...data }
    },
    ...stack.formBase,
  }) as any

  return {
    form,
    gate,
    submitted,
    /**
     * Write one profile row into the cache, as a fetch would.
     *
     * @param id Id of the profile row.
     * @param bio Content telling the rows apart.
     */
    writeProfile: (id: string, bio: string) => stack.write('profiles', { id, bio }),
    /** Foreign key the fake backend currently holds for the user row. */
    savedProfileId: () => saved.profileId ?? null,
  }
}

/**
 * Apply the relation operations of one submit to the cache: what an operation
 * removes points away from the user, what it adds points at them.
 *
 * A whole-relation operation is recognised by its array `newValue`, not by the
 * rows its `oldValue` lists: that list only carries what the form knew
 * locally, so a backend reading it alone would leave the relation untouched.
 *
 * @param backend Row writers and the `set` interpretation to apply.
 * @param backend.writePost Points one row at an owner.
 * @param backend.unlinkAll Points every row of the user away from them.
 * @param backend.setMode Backend interpretation of a to-many `set`.
 * @param operations Operations the submit sent.
 */
function applyPostOps(
  backend: { writePost: (id: string, authorId: string) => void, unlinkAll: () => void, setMode: RelationSetMode },
  operations: FormOperation<any>[],
) {
  for (const op of operations) {
    if (op.field !== 'posts')
      continue
    const isDisconnectAll = op.type === 'disconnect' && Array.isArray(op.newValue)
    if (isDisconnectAll || (op.type === 'set' && backend.setMode === 'replace'))
      backend.unlinkAll()
    for (const item of operationItems(op.oldValue)) {
      backend.writePost(item.id, otherUserId)
    }
    for (const item of operationItems(op.newValue)) {
      backend.writePost(item.id, userId)
    }
  }
}
