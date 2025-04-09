<script lang="ts" setup>
const store = useStore()

// Load all messages
const [
  { data: messages, refresh: refreshMessages },
  { data: users, refresh: refreshUsers },
  { data: bots, refresh: refreshBots },
] = await Promise.all([
  store.Message.queryMany(),
  store.User.queryMany(),
  store.Bot.queryMany(),
])

async function refresh() {
  await Promise.all([
    refreshMessages(),
    refreshUsers(),
    refreshBots(),
  ])
}

const selectedUser = shallowRef<typeof users.value[number] | null>(users.value?.[0] ?? null)

const receivedMessages = computed(() => selectedUser.value?.receivedMessages ?? [])
const sentMessages = computed(() => selectedUser.value?.sentMessages ?? [])

async function sendMessage(receive = false) {
  if (!selectedUser.value) {
    return
  }

  const { faker } = await import('@faker-js/faker')

  const selectedUserId = selectedUser.value.id
  const recipientIds = users.value.map(user => user.id).filter(id => id !== selectedUserId)
  const recipientId = recipientIds[Math.floor(Math.random() * recipientIds.length)]

  await store.Message.create({
    authorId: receive ? recipientId : selectedUserId,
    recipientId: receive ? selectedUserId : recipientId,
    text: faker.lorem.paragraph(),
  })
}
</script>

<template>
  <div class="p-4 space-y-4">
    <h1>Read related items from cache</h1>

    <UButton
      icon="lucide:refresh-cw"
      label="Refresh"
      @click="refresh()"
    />

    <div class="flex overflow-x-auto">
      <UButtonGroup>
        <UButton
          v-for="user in users"
          :key="user.id"
          :label="user.name"
          :avatar="user.avatar ? {
            src: user.avatar,
            alt: user.name,
          } : undefined"
          :color="selectedUser === user ? 'primary' : 'neutral'"
          :variant="selectedUser === user ? 'solid' : 'subtle'"
          @click="selectedUser = user"
        />
      </UButtonGroup>
    </div>

    <div v-if="selectedUser">
      <div class="flex gap-2">
        <UButton
          icon="lucide:arrow-up"
          label="Send message"
          @click="sendMessage()"
        />
        <UButton
          icon="lucide:arrow-down"
          label="Receive message"
          @click="sendMessage(true)"
        />
      </div>

      <UTabs
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
              v-for="{ id } in receivedMessages"
              :id
              :key="id"
              skip-nested-fetch
            />

            <div
              v-if="!receivedMessages.length"
              class="text-center text-gray-500 p-4"
            >
              No messages
            </div>
          </div>
        </template>

        <template #sent>
          <div>
            <MessageItem
              v-for="{ id } in sentMessages"
              :id
              :key="id"
              skip-nested-fetch
            />

            <div
              v-if="!sentMessages.length"
              class="text-center text-gray-500 p-4"
            >
              No messages
            </div>
          </div>
        </template>
      </UTabs>
    </div>
  </div>

  <USeparator />

  <Output :data="messages" title="messages" />
  <Output :data="users" title="users" />
  <Output :data="bots" title="bots" />
</template>
