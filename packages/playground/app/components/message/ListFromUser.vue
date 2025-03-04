<script lang="ts" setup>
const props = defineProps<{
  userId: string
}>()

const store = useStore()

const { data: userWithMessages } = await store.User.queryFirst(() => ({
  key: props.userId,
  include: {
    receivedMessages: true,
    sentMessages: true,
  },
  // fetchPolicy: 'cache-and-fetch',
}))
</script>

<template>
  <UTabs
    v-if="userWithMessages"
    :items="[
      {
        label: 'Received',
        icon: 'lucide:inbox',
        slot: 'received',
      },
      {
        label: 'Sent',
        icon: 'lucide:send',
        slot: 'sent',
      },
    ]"
    variant="link"
  >
    <template #received>
      <div>
        <MessageItem
          v-for="{ id } in userWithMessages.receivedMessages"
          :id
          :key="id"
          skip-nested-fetch
        />

        <div
          v-if="!userWithMessages.receivedMessages.length"
          class="text-center text-gray-500 p-4"
        >
          No messages
        </div>
      </div>
    </template>

    <template #sent>
      <div>
        <MessageItem
          v-for="{ id } in userWithMessages.sentMessages"
          :id
          :key="id"
          skip-nested-fetch
        />

        <div
          v-if="!userWithMessages.sentMessages.length"
          class="text-center text-gray-500 p-4"
        >
          No messages
        </div>
      </div>
    </template>
  </UTabs>

  <Output :data="userWithMessages" title="userWithMessages" />
  <Output :data="userWithMessages?.receivedMessages" title="receivedMessages" />
  <Output :data="userWithMessages?.sentMessages" title="sentMessages" />
</template>
