<script lang="ts" setup>
const route = useRoute()
const docId = route.params.id as string
const store = useStore()

const doc = useRstoreCollabDocument(docId, { collection: 'DocNode' })

// The blocks as rstore rows: the cache mirror of the document.
const blocks = computed(() => store.DocNode.peekMany().filter(node => node.docId === docId && !node.deleted))
</script>

<template>
  <div class="m-4 p-4 border border-default rounded-xl flex flex-col gap-4">
    <h2 class="text-xl font-bold flex items-center gap-2">
      <UIcon name="lucide:file-text" />
      Collab document {{ docId }}
    </h2>

    <div class="flex gap-4 text-sm opacity-70">
      <span data-testid="collab-status">{{ doc.loaded.value ? doc.status.value : 'loading' }}</span>
      <span data-testid="collab-blocks">{{ blocks.length }} blocks</span>
    </div>

    <DocCollabEditor
      v-if="doc.loaded.value"
      :client="doc.client"
    />
  </div>
</template>
