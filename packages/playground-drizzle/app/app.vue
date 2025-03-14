<script lang="ts" setup>
useHead({
  title: 'rstore playground',
})
</script>

<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <NuxtLoadingIndicator />

    <div class="flex h-screen">
      <div class="flex-1 min-w-0 flex flex-col h-screen overflow-auto">
        <nav>
          Nav here
        </nav>

        <div class="flex-1">
          <NuxtPage />
        </div>
      </div>
    </div>
  </UApp>
</template>
