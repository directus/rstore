<script lang="ts" setup>
const store = useVanillaStore()

// Load all messages
const [
  { data: messages },
  { data: users },
  { data: bots },
] = await Promise.all([
  store.Message.queryMany(),
  store.User.queryMany(),
  store.Bot.queryMany(),
])

const selectedUser = shallowRef<typeof users.value[number] | null>(null)
</script>

<template>
  <div class="p-4 space-y-4">
    <h1>Read related items from cache</h1>

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
              v-for="{ id } in selectedUser.receivedMessages"
              :id
              :key="id"
              skip-nested-fetch
            />

            <div
              v-if="!selectedUser.receivedMessages.length"
              class="text-center text-gray-500 p-4"
            >
              No messages
            </div>
          </div>
        </template>

        <template #sent>
          <div>
            <MessageItem
              v-for="{ id } in selectedUser.sentMessages"
              :id
              :key="id"
              skip-nested-fetch
            />

            <div
              v-if="!selectedUser.sentMessages.length"
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
