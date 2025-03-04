import { formatTimeAgo } from '@vueuse/core'

const reactiveTime = useTimestamp()
const getTime = () => import.meta.server ? Date.now() : reactiveTime.value

export const Todo = defineItemType<Todo>().modelType({
  name: 'Todo',
  schema: {
    create: createValidationSchemas.todos,
    update: updateValidationSchemas.todos,
  },
  meta: {
    path: 'todos',
  },
} as const)

export const User = defineItemType<User>().modelType({
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

export const Bot = defineItemType<Bot>().modelType({
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

export const Message = defineItemType<Message>().modelType({
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
    timeAgo: message => formatTimeAgo(message.createdAt, {}, getTime()),
  },
  meta: {
    path: 'messages',
  },
} as const)
