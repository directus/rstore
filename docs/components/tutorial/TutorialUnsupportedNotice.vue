<script setup lang="ts">
defineProps<{
  reason: string | null
  needsCrossOriginIsolation: boolean
}>()
</script>

<template>
  <section class="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100">
    <h2 class="text-sm font-semibold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-400">
      Browser support
    </h2>
    <p class="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
      {{ reason }}
    </p>
    <p v-if="needsCrossOriginIsolation" class="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
      This page needs cross-origin isolation headers before WebContainers can boot.
    </p>
  </section>
</template>
