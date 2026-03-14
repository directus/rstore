<script setup lang="ts">
import { useStore } from '@rstore/vue'
import { computed, watchEffect } from 'vue'
import { registerTutorialAction } from '../tutorial/bridge'
import { reportCacheState } from '../tutorial/reporting'

const store = useStore()
const cachedTodos = computed(() => store.Todo.peekMany())

function updateCacheState(patch: Record<string, unknown> = {}) {
  reportCacheState(cachedTodos.value.length, patch)
}

function injectCachedTodo() {
  store.Todo.writeItem({
    id: 'cached-manual-item',
    text: 'Injected from writeItem()',
    completed: false,
    assigneeId: 'user-2',
  })

  updateCacheState({
    injected: true,
  })
}

function clearCache() {
  store.$cache.clear()
  updateCacheState({
    cleared: true,
  })
}

registerTutorialAction('cache-smoke', async () => {
  injectCachedTodo()
  clearCache()

  updateCacheState({
    injected: true,
    cleared: true,
  })
})

watchEffect(() => {
  updateCacheState()
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

    <span class="meta-pill">
      {{ cachedTodos.length }} items visible via <code>peekMany()</code>
    </span>
  </section>
</template>
