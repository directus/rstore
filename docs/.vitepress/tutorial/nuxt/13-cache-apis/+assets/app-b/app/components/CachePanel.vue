<script setup lang="ts">
const store = useStore()
const cachedTodos = computed(() => store.Todo.peekMany())

function injectCachedTodo() {
  store.Todo.writeItem({
    id: 'cached-manual-item',
    text: 'Injected from writeItem()',
    completed: false,
    assigneeId: 'user-2',
  })
}

function clearCache() {
  store.$cache.clear()
}
</script>

<template>
  <section class="stack">
    <h2>Cache controls</h2>

    <div class="toolbar">
      <button @click="injectCachedTodo()">
        Inject cached todo
      </button>

      <button class="secondary" @click="clearCache()">
        Clear cache
      </button>
    </div>

    <span class="meta-pill">
      {{ cachedTodos.length }} items visible via <code>peekMany()</code>
    </span>
  </section>
</template>
