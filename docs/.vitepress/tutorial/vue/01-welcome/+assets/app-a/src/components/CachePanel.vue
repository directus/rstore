<script setup lang="ts">
import { useStore } from '@rstore/vue'
import { computed } from 'vue'

const store = useStore()
const _cachedTodos = computed(() => store.Todo.peekMany())

function injectCachedTodo() {
}

function clearCache() {
}
</script>

<template>
  <section class="stack">
    <div class="panel-header">
      <div class="stack">
        <p class="section-label">
          Local cache
        </p>
        <h2>Manual cache actions</h2>
      </div>
    </div>

    <div class="toolbar">
      <button @click="injectCachedTodo()">
        Inject task
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
