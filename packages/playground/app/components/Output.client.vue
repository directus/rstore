<script lang="ts" setup>
import { codeToHtml } from 'shiki'

const { data, lang = 'json' } = defineProps<{
  data: any
  lang?: string
  title?: string
}>()

const colorMode = useColorMode()

const html = asyncComputed(() => codeToHtml(lang === 'json' ? JSON.stringify(data, null, 2) : String(data), {
  lang,
  theme: colorMode.value === 'dark' ? 'one-dark-pro' : 'one-light',
}))
</script>

<template>
  <div class="text-xs p-4 bg-gray-500/10 rounded-xl m-4">
    <div
      v-if="title"
      class="text-gray-500 text-center font-bold mb-1"
    >
      {{ title }}
    </div>
    <div class="[&>.shiki]:!bg-transparent [&>.shiki]:whitespace-pre-wrap" v-html="html" />
  </div>
</template>
