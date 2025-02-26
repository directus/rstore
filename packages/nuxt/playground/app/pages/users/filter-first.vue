<script lang="ts" setup>
const store = useVanillaStore()

const email = ref('user1@acme.com')

const { data: user } = await store.User.queryFirst(() => ({
  filter: item => item.email === email.value,
  params: {
    filter: `email:${email.value}`,
  },
}))
</script>

<template>
  <div class="m-4">
    <UFormField
      label="Filter by email"
    >
      <UInput
        v-model="email"
        icon="lucide:search"
        trailing-icon="lucide:mail"
      />
    </UFormField>
  </div>

  <div class="flex gap-4 flex-wrap m-4">
    <UserItem
      v-if="user"
      :id="user.id"
    />
  </div>

  <Output>{{ user }}</Output>
</template>
