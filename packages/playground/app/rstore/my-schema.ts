import { formatTimeAgo } from '@vueuse/core'

const reactiveTime = useTimestamp()
const getTime = () => import.meta.server ? Date.now() : reactiveTime.value

export const users = withItemType<User>().defineCollection({
  name: 'User',
  relations: {
    receivedMessages: {
      to: {
        Message: {
          on: {
            recipientId: 'id',
          },
        },
      },
      many: true,
    },
    sentMessages: {
      to: {
        Message: {
          on: {
            authorId: 'id',
          },
        },
      },
      many: true,
    },
  },
  // state: () => ({
  //   currentUserKey: null as string | null,
  // }),
  // global: {

  // },
  // global: {
  //   currentUser: {
  //     find: state => ({
  //       key: state.currentUserKey,
  //     }),
  //   },
  // },
  // mutations: {
  //   login: {},
  //   logout: {},
  // },
  meta: {
    path: 'users',
  },
})

export const bots = withItemType<Bot>().defineCollection({
  name: 'Bot',
  relations: {
    receivedMessages: {
      to: {
        Message: {
          on: {
            recipientId: 'id',
          },
        },
      },
      many: true,
    },
    sentMessages: {
      to: {
        Message: {
          on: {
            authorId: 'id',
          },
        },
      },
      many: true,
    },
  },
  meta: {
    path: 'bots',
  },
})

export const messages = withItemType<Message>().defineCollection({
  name: 'Message',
  relations: {
    author: {
      to: {
        User: {
          on: {
            id: 'authorId',
          },
        },
        Bot: {
          on: {
            id: 'authorId',
          },
        },
      },
    },
    recipient: {
      to: {
        User: {
          on: {
            id: 'recipientId',
          },
        },
        Bot: {
          on: {
            id: 'recipientId',
          },
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
})
