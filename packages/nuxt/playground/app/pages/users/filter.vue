<script lang="ts" setup>
const store = useVanillaStore()
const users = await store.query.User.findMany({
  filter: item => item.email === 'user1@acme.com',
  params: {
    filter: 'email:user1@acme.com',
  },
})
</script>

<template>
  <pre>{{ users }}</pre>
</template>
