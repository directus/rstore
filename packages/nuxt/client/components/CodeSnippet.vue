<script lang="ts" setup>
import { codeToHtml } from 'shiki'

const { code, lang = 'json' } = defineProps<{
  code: any
  lang?: string
}>()

const colorMode = useColorMode()

const html = asyncComputed(() => codeToHtml(lang === 'json' ? JSON.stringify(code, null, 2) : String(code), {
  lang,
  theme: colorMode.value === 'dark' ? 'one-dark-pro' : 'one-light',
}))
</script>

<template>
  <div class="[&>.shiki]:!bg-transparent [&>.shiki]:whitespace-pre-wrap" v-html="html" />
</template>
