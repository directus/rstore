<script lang="ts" setup>
const { code, lang = 'json' } = defineProps<{
  code: any
  lang?: string
}>()

const colorMode = useColorMode()

const html = computed(() => getHighlighter().codeToHtml(lang === 'json' ? JSON.stringify(code, null, 2) : String(code), {
  lang,
  theme: colorMode.value === 'dark' ? 'one-dark-pro' : 'one-light',
}))
</script>

<template>
  <div class="[&>.shiki]:!bg-transparent [&>.shiki]:whitespace-pre-wrap" v-html="html" />
</template>
