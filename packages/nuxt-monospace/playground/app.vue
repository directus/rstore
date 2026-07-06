<script setup lang="ts">
const monospace = useMonospace()
const store = useStore()

// `include` maps to Monospace nested field selection and is typed from the
// generated collection relations.
const { data: todos } = await store.Todos.query(q => q.many({
  include: {
    author: true,
  },
}))

// Wrapped items expose relation accessors resolved from the rstore cache.
const firstAuthorName = computed(() => todos.value[0]?.author?.name)
</script>

<template>
  <div>{{ Boolean(monospace) }}</div>
  <div>{{ firstAuthorName }}</div>
</template>
