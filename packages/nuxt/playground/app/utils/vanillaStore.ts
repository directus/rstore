import type { Model } from '@rstore/shared'
import type { InjectionKey } from 'vue'
import { defineItemType, type VueStore } from '@rstore/vue'

export const vanillaModel = {
  Todo: defineItemType<Todo>().modelType({
    name: 'Todo',
    schema: {
      create: createValidationSchemas.todos,
      update: updateValidationSchemas.todos,
    },
    meta: {
      path: 'todos',
    },
  }),
  User: defineItemType<User>().modelType({
    name: 'User',
    relations: [
      {
        name: 'receivedMessages',
        model: 'Message',
        type: 'many',
        field: 'id',
        reference: 'recipientId',
      },
      {
        name: 'sentMessages',
        model: 'Message',
        type: 'many',
        field: 'id',
        reference: 'authorId',
      },
    ],
    meta: {
      path: 'users',
    },
  }),
  Message: defineItemType<Message>().modelType({
    name: 'Message',
    relations: [
      {
        name: 'author',
        model: 'User',
        type: 'one',
        field: 'authorId',
        reference: 'id',
      },
      {
        name: 'recipient',
        model: 'Message',
        type: 'many',
        field: 'recipientId',
        reference: 'id',
      },
    ],
    meta: {
      path: 'messages',
    },
  }),
} as const satisfies Model

export const vanillaStoreKey = Symbol('vanillaStore') as InjectionKey<VueStore<typeof vanillaModel>>

export function useVanillaStore() {
  const store = inject(vanillaStoreKey, null)
  if (store === null) {
    throw new Error('No vanillaStore provided.')
  }
  return store
}
