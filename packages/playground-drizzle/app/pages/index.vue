<script lang="ts" setup>
const store = useStore()

const email = ref('')

const { data: users } = await store.users.queryMany(() => ({
  params: {
    where: email.value ? eq('email', email.value) : undefined,
  },
  include: {
    posts: true,
  },
}))
</script>

<template>
  <UInput
    v-model="email"
    label="Email"
    placeholder="Enter email to filter users"
  />
  <pre>{{ users.map(user => ({ id: user.id, email: user.email, posts: user.posts })) }}</pre>
</template>
