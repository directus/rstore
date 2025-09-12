export default withItemType<ChatMessage>().defineCollection({
  name: 'ChatMessage',
  meta: {
    websocketTopic: 'chat-messages',
  },
})
