export default defineItemType<ChatMessage>().model({
  name: 'ChatMessage',
  meta: {
    websocketTopic: 'chat-messages',
  },
} as const)
