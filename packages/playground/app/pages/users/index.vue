<script lang="ts" setup>
const store = useStore()
const { data: users } = await store.User.query(q => q.many())
</script>

<template>
  <div class="flex gap-4 flex-wrap m-4">
    <UserItem
      v-for="{ id } in users"
      :id
      :key="id"
    />
  </div>

  <Output :data="users" title="users" />
</template>
