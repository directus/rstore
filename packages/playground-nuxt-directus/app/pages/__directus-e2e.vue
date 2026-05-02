<script lang="ts" setup>
import { createDirectusE2eHarness } from '~/utils/directus-e2e/harness'

const store = useStore()

onMounted(() => {
  window.__rstoreDirectusE2E = createDirectusE2eHarness(store)
})

onBeforeUnmount(() => {
  delete window.__rstoreDirectusE2E
})
</script>

<template>
  <div data-testid="directus-e2e-harness">
    Directus e2e harness ready
  </div>
</template>
