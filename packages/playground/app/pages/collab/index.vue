<script lang="ts" setup>
const store = useStore()

const { data: documents } = await store.CollabDocument!.query(q => q.many())

const createDoc = store.CollabDocument!.createForm()
const titleInput = useTemplateRef('titleInput')
createDoc.$onSuccess(() => {
  titleInput.value?.inputRef?.focus()
})
</script>

<template>
  <div class="m-4 p-4 border border-default rounded-xl flex flex-col gap-4">
    <h2 class="text-xl font-bold flex items-center gap-2">
      <UIcon name="lucide:file-edit" />
      Collaborative Documents
    </h2>

    <p class="text-sm opacity-60">
      Open a document in multiple browser tabs to see realtime collaboration with form $rebase and conflict resolution.
    </p>

    <UForm
      :state="createDoc"
      :schema="createDoc.$schema"
      class="flex gap-2"
      @submit="createDoc.$submit()"
    >
      <UInput
        ref="titleInput"
        v-model="createDoc.title"
        placeholder="New document title..."
        autofocus
        class="flex-1"
      />
      <UButton
        type="submit"
        icon="lucide:plus"
        label="Create"
        :loading="createDoc.$loading"
        :disabled="!createDoc.$valid"
      />
    </UForm>

    <USeparator />

    <div class="flex flex-col gap-2">
      <NuxtLink
        v-for="doc in documents"
        :key="doc.id"
        :to="`/collab/${doc.id}`"
        class="flex items-center gap-3 p-3 rounded-lg border border-default hover:bg-primary-500/5 transition-colors"
      >
        <UIcon
          :name="doc.status === 'published' ? 'lucide:globe' : 'lucide:file-text'"
          class="text-lg"
          :class="doc.status === 'published' ? 'text-green-500' : 'text-gray-400'"
        />
        <div class="flex-1 min-w-0">
          <div class="font-medium truncate">
            {{ doc.title }}
          </div>
          <div class="text-xs opacity-50 truncate">
            {{ doc.body?.slice(0, 100) }}...
          </div>
        </div>
        <UBadge
          :label="doc.status"
          :color="doc.status === 'published' ? 'success' : 'neutral'"
          variant="soft"
          size="sm"
        />
        <UIcon name="lucide:chevron-right" class="opacity-30" />
      </NuxtLink>

      <div v-if="!documents.length" class="text-center text-gray-500 p-12">
        No documents yet
      </div>
    </div>
  </div>
</template>
