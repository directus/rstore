<script setup lang="ts">
import { useStore } from '@rstore/vue'
import { computed } from 'vue'

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
    <div class="panel-header">
      <div class="stack">
        <p class="section-label">Local cache</p>
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

    <span class="meta-pill">
      {{ cachedTodos.length }} items visible via <code>peekMany()</code>
    </span>
  </section>
</template>
