<script setup lang="ts">
import { computed } from 'vue'
import { useInspector } from '../stores/connection'
import PreviewValue from './preview/PreviewValue.vue'
/** Request metadata remains available when SSR initialization produced no stores. */
const { state } = useInspector()
/** Detached request has no query, headers or body; errors use bounded previews. */
const request = computed(() => state.session?.request)
</script>

<template>
  <section v-if="request" class="data-card" aria-label="Recorded request">
    <header>
      <h2>{{ request.method }} {{ request.path }}</h2>
      <span v-if="request.duration !== undefined">{{ request.duration }} ms</span>
    </header>
    <PreviewValue v-if="request.error !== undefined" :value="request.error" />
  </section>
</template>
