<script lang="ts" setup>
const store = useStore()

// const { data: messages } = store.ChatMessage.query(q => q.many({
//   fetchPolicy: 'cache-only',
// }))
// store.ChatMessage.subscribe()

const { data: messages } = store.ChatMessage.liveQuery(q => q.many({
  fetchPolicy: 'cache-only',
}))

type CreateChat = StoreCreateFormObject<'ChatMessage'>

const createChatMessage: CreateChat = store.ChatMessage.createForm()

const input = useTemplateRef('input')
createChatMessage.$onSuccess(() => {
  input.value?.inputRef?.focus()
  input.value?.inputRef?.select()
})
</script>

<template>
  <div class="flex flex-col h-full p-12 gap-2">
    <UInput
      ref="input"
      v-model="createChatMessage.text"
      placeholder="Type your message here..."
      icon="lucide:message-circle"
      autofocus
      @keyup.enter="createChatMessage.$submit()"
    />

    <div class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
      <ChatMessage
        v-for="{ id } in messages.slice().reverse()"
        :id
        :key="id"
      />
    </div>
  </div>
</template>
