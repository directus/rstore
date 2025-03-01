<script lang="ts" setup>
const props = defineProps<{
  id: string
  skipNestedFetch?: boolean
}>()

const store = useVanillaStore()

const { data: message } = await store.Message.queryFirst(props.id)
</script>

<template>
  <div
    v-if="message"
    class="flex items-start p-2 gap-2"
  >
    <UAvatar
      :src="message.author && 'avatar' in message.author ? message.author.avatar : undefined"
      :alt="message.author?.name"
      :icon="message.author?.$type === 'Bot' ? 'lucide:bot' : undefined"
    />
    <div class="flex flex-col gap-1">
      <div
        v-if="message.author"
        class="flex items-center gap-2"
      >
        <span class="font-bold">
          {{ message.author.name }}
        </span>

        <UBadge
          v-if="message.author.$type === 'Bot'"
          icon="lucide:bot"
          color="secondary"
          variant="soft"
          size="sm"
          label="Bot"
          class="rounded-full"
        />

        <UTooltip
          text="Sent messages"
          :content="{ side: 'top' }"
        >
          <UBadge
            icon="lucide:mail"
            color="neutral"
            variant="soft"
            size="sm"
            :label="message.author.sentMessages.length"
            class="rounded-full"
          />
        </UTooltip>
      </div>
      <p
        class="px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg"
      >
        {{ message.text }}
      </p>
    </div>
  </div>
</template>
