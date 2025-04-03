import { formatTimeAgo } from '@vueuse/core'

const reactiveTime = useTimestamp()
const getTime = () => import.meta.server ? Date.now() : reactiveTime.value

// Multiple models
export default [
  defineItemType<User>().model({
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
  }),

  defineItemType<Bot>().model({
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
  }),

  defineItemType<Message>().model({
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
  }),
]
