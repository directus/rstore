<script lang="ts" setup>
const store = useVanillaStore()
console.log('store', store)

const users = await store.query.User.findMany()

console.log('users', users)

const user = await store.query.User.findFirst('user1')
</script>

<template>
  <h1>Hello world</h1>

  <pre>{{ users }}</pre>

  <div v-if="user" class="inline-flex items-center gap-2 p-2 rounded-full bg-blue-500/10">
    <UAvatar :src="user.avatar" :alt="user.name" />
    <p>{{ user.name }}</p>
  </div>
</template>
