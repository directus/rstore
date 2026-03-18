<script setup lang="ts">
import { useStore } from '@rstore/vue'
import { computed } from 'vue'

const store = useStore()
const cachedTodos = computed(() => store.Todo.peekMany())

function injectCachedTodo() {
}

function clearCache() {
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

    <p class="hint">
      Replace these handlers with <code>writeItem()</code>, <code>peekMany()</code>, and <code>$cache.clear()</code>.
    </p>
  </section>
</template>
