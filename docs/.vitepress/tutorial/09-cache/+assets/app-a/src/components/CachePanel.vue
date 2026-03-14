<script setup lang="ts">
import { useStore } from '@rstore/vue'
import { computed, watchEffect } from 'vue'
import { registerTutorialAction } from '../tutorial/bridge'
import { reportCacheState } from '../tutorial/reporting'

const store = useStore()
const cachedTodos = computed(() => store.Todo.peekMany())

function injectCachedTodo() {
}

function clearCache() {
}

registerTutorialAction('cache-smoke', async () => {
  injectCachedTodo()
  clearCache()

  reportCacheState(cachedTodos.value.length, {
    injected: false,
    cleared: false,
  })
})

watchEffect(() => {
  reportCacheState(cachedTodos.value.length)
})
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
