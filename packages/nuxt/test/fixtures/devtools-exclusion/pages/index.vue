<script setup lang="ts">
import { useStore } from '@rstore/vue'

const store = useStore()
</script>

<template>
  <div>{{ store ? 'store-ready' : 'store-missing' }}</div>
</template>
