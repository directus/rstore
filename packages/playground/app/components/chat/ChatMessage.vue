<script lang="ts" setup>
const props = defineProps<{
  id: string
}>()

const store = useStore()

const { data: message } = await store.ChatMessage.query(q => q.first(props.id))

const timeAgo = useTimeAgo(() => message.value?.createdAt ?? 0)
</script>

<template>
  <div
    v-if="message"
    class="flex px-4 py-2 bg-gray-500/10 rounded-lg gap-3"
  >
    <UAvatar
      :src="message.userAvatar"
      class="mt-2"
    />
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <div class="text-primary-500 flex-1 min-w-0 truncate">
          {{ message.userName }}
        </div>
        <div class="opacity-25">
          {{ timeAgo }}
        </div>
      </div>
      <div>
        {{ message.text }}
      </div>
    </div>
  </div>
</template>
