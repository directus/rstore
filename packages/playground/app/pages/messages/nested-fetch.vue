<script lang="ts" setup>
const store = useStore()

const { data: users } = await store.User.queryMany()

const selectedUser = shallowRef<typeof users.value[number] | null>(users.value?.[0] ?? null)
</script>

<template>
  <div class="p-4 space-y-4">
    <h1>Fetch with nested relations</h1>

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
      <MessageListFromUser :user-id="selectedUser.id" />
    </div>
  </div>

  <USeparator />

  <Output :data="users" title="users" />
</template>
