<script lang="ts" setup>
const props = defineProps<{
  id: string
}>()

const store = useStore()

const { data: user } = await store.User.query(q => q.first(props.id))
</script>

<template>
  <div v-if="user" class="inline-flex items-center gap-2 pl-3 pr-4 py-2 rounded-full bg-blue-500/10">
    <UAvatar :src="user.avatar" :alt="user.name" />
    <div class="leading-tight">
      <div>{{ user.name }}</div>
      <div class="opacity-50 text-sm">
        {{ user.email }}
      </div>
    </div>
  </div>
</template>
