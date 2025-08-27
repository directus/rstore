<script lang="ts" setup>
const store = useStore()

const { data: messages } = await store.Message.query(q => q.many())
</script>

<template>
  <div class="p-4 flex flex-col gap-4">
    <h1>Computed message fields</h1>

    <div
      v-for="message in messages"
      :key="message.id"
      class="flex items-center px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg gap-2"
    >
      <div class="flex-1 min-w-0 truncate">
        {{ message.extract }}
      </div>
      <div class="opacity-50">
        {{ message.timeAgo }}
      </div>
    </div>
  </div>

  <Output :data="messages" title="messages" />
</template>
