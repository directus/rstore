<script lang="ts" setup>
const store = useHostRstore()
</script>

<template>
  <UApp>
    <Devtools
      v-if="store"
      class="h-screen"
    />
    <div
      v-else
      class="h-screen flex flex-col animate-pulse text-lg gap-2 items-center justify-center"
    >
      <UIcon name="carbon:circle-dash" class="animate-spin text-4xl opacity-50" />
      <div>
        Waiting for store...
      </div>
    </div>
  </UApp>
</template>
