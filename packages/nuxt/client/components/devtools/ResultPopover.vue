<script lang="ts" setup>
const props = defineProps<{
  result: any
}>()

const isComplexType = computed(() => props.result && typeof props.result === 'object')
</script>

<template>
  <UPopover
    v-if="isComplexType"
    arrow
  >
    <template #default="{ open }">
      <UBadge
        v-if="result && Array.isArray(result)"
        :label="result.length || '0'"
        icon="lucide:arrow-right"
        color="success"
        size="sm"
        :variant="result.length ? 'subtle' : 'outline'"
        class="font-sans align-middle cursor-pointer"
        :class="{
          'outline outline-primary-500': open,
        }"
      />
      <UBadge
        v-if="result && !Array.isArray(result)"
        label="1"
        icon="lucide:arrow-right"
        color="success"
        size="sm"
        variant="subtle"
        class="font-sans align-middle cursor-pointer"
        :class="{
          'outline outline-primary-500': open,
        }"
      />
    </template>

    <template #content>
      <CodeSnippet
        :code="result"
        class="text-xs p-2 max-w-120 max-h-90 overflow-auto"
      />
    </template>
  </UPopover>

  <UBadge
    v-else
    size="sm"
    variant="subtle"
    color="neutral"
    :label="String(result)"
  />
</template>
