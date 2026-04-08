<script setup lang="ts">
const store = useStore()
const cachedTodos = computed(() => store.Todo.peekMany())

function injectCachedTodo() {
}

function clearCache() {
}
</script>

<template>
  <section class="stack">
    <h2>Cache</h2>

    <div class="toolbar">
      <button @click="injectCachedTodo()">
        Inject task
      </button>

      <button class="secondary" @click="clearCache()">
        Clear cache
      </button>
    </div>

    <p class="hint">
      {{ cachedTodos.length }} cached items
    </p>
  </section>
</template>
