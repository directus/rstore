import { createFormObject } from '@rstore/vue'
import { createRelationStack } from './relationStore'

/** Create a relation payload that is easy to inspect through Vue effects. */
export function createProfilePayload(id: string) {
  return { _connect: { key: { id } } }
}

/** Create a consumer-specific to-many relation payload. */
export function createPostsPayload(id: string) {
  return [{ _connect: { keys: [{ id }] } }]
}

/** Create a form with the profile relation enabled, on a real store. */
export async function createProfileForm(initialProfile?: any) {
  const stack = await createRelationStack()
  const form = createFormObject({
    defaultValues: () => ({
      id: 'user-1',
      name: 'John',
      profileId: null as string | null,
      ...(initialProfile === undefined ? {} : { profile: initialProfile }),
    }),
    submit: async () => undefined,
    ...stack.formBase,
    validateOnSubmit: false,
  }) as any
  return { form, stack }
}

/** Create a form with a many relation enabled, on a real store. */
export async function createPostsForm(initialPosts?: any[], submit: any = async () => undefined) {
  const stack = await createRelationStack()
  const form = createFormObject({
    defaultValues: () => ({
      id: 'user-1',
      name: 'John',
      posts: initialPosts,
    }),
    submit,
    ...stack.formBase,
    validateOnSubmit: false,
  }) as any
  return { form, stack }
}
