import type { Model } from '@rstore/shared'
import type { InjectionKey } from 'vue'
import { defineItemType, type VueStore } from '@rstore/vue'
import { formatTimeAgo } from '@vueuse/core'

const time = useTimestamp()

const Todo = defineItemType<Todo>().modelType({
  name: 'Todo',
  schema: {
    create: createValidationSchemas.todos,
    update: updateValidationSchemas.todos,
  },
  meta: {
    path: 'todos',
  },
} as const)

const User = defineItemType<User>().modelType({
  name: 'User',
  relations: {
    receivedMessages: {
      to: {
        Message: {
          on: 'recipientId',
          eq: 'id',
        },
      },
      many: true,
    },
    sentMessages: {
      to: {
        Message: {
          on: 'authorId',
          eq: 'id',
        },
      },
      many: true,
    },
  },
  meta: {
    path: 'users',
  },
} as const)

const Bot = defineItemType<Bot>().modelType({
  name: 'Bot',
  relations: {
    receivedMessages: {
      to: {
        Message: {
          on: 'recipientId',
          eq: 'id',
        },
      },
      many: true,
    },
    sentMessages: {
      to: {
        Message: {
          on: 'authorId',
          eq: 'id',
        },
      },
      many: true,
    },
  },
  meta: {
    path: 'bots',
  },
} as const)

const Message = defineItemType<Message>().modelType({
  name: 'Message',
  relations: {
    author: {
      to: {
        User: {
          on: 'id',
          eq: 'authorId',
        },
        Bot: {
          on: 'id',
          eq: 'authorId',
        },
      },
    },
    recipient: {
      to: {
        User: {
          on: 'id',
          eq: 'recipientId',
        },
        Bot: {
          on: 'id',
          eq: 'recipientId',
        },
      },
    },
  },
  computed: {
    extract: message => `${message.text.slice(0, 10)}... (+${message.text.length - 10} chars)`,
    timeAgo: message => formatTimeAgo(message.createdAt, {}, time.value),
  },
  meta: {
    path: 'messages',
  },
} as const)

export const vanillaModel = {
  Todo,
  User,
  Bot,
  Message,
} as const satisfies Model

export const vanillaStoreKey = Symbol('vanillaStore') as InjectionKey<VueStore<typeof vanillaModel>>

export function useVanillaStore() {
  const store = inject(vanillaStoreKey, null)
  if (store === null) {
    throw new Error('No vanillaStore provided.')
  }
  return store
}
