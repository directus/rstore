<script lang="ts" setup>
const route = useRoute()
const id = route.params.id as string
</script>

<template>
  <div class="m-4 p-4 border border-default rounded-xl flex flex-col gap-4">
    <div class="flex items-center gap-2">
      <NuxtLink to="/collab">
        <UButton
          icon="lucide:arrow-left"
          variant="ghost"
          color="neutral"
          size="sm"
        />
      </NuxtLink>
      <h2 class="text-xl font-bold flex items-center gap-2">
        <UIcon name="lucide:file-edit" />
        Edit Document
      </h2>
    </div>

    <CollabEditor :id="id" />
  </div>
</template>
