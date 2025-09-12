<script lang="ts" setup>
const store = useStore()

const email = ref('user1@acme.com')

const { data: users } = await store.User.query(q => q.many({
  filter: item => item.email === email.value,
  params: {
    filter: `email:${email.value}`,
  },
}))
users.value?.map(user => user)
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
      v-for="{ id } in users"
      :id
      :key="id"
    />
  </div>

  <Output :data="users" title="users" />
</template>
