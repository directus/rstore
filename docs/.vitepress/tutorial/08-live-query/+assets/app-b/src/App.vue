<script setup lang="ts">
import { useStore } from '@rstore/vue'
import { watchEffect } from 'vue'
import { memoryBackend } from './tutorial/backend'
import { registerTutorialAction } from './tutorial/bridge'
import { reportLiveState } from './tutorial/reporting'

const store = useStore()
const { data: todos } = await store.Todo.liveQuery(q => q.many())

async function simulateRemoteTodo() {
  memoryBackend.simulateRemoteTodo()
  await new Promise(resolve => window.setTimeout(resolve, 80))
}

registerTutorialAction('live-smoke', async () => {
  const before = todos.value.length
  await simulateRemoteTodo()

  reportLiveState(
    todos.value,
    todos.value.length > before && todos.value.some(todo => todo.text.startsWith('Remote todo')),
  )
})

watchEffect(() => {
  reportLiveState(
    todos.value,
    todos.value.some(todo => todo.text.startsWith('Remote todo')),
  )
})
</script>

<template>
  <main class="tutorial-app">
    <header class="hero">
      <h1>Step 8: Live Query</h1>
      <p>Use <code>liveQuery()</code> so remote inserts update the rendered list automatically.</p>
    </header>

    <section class="surface">
      <div class="toolbar">
        <button @click="simulateRemoteTodo()">
          Simulate remote todo
        </button>

        <span class="meta-pill">
          {{ todos.length }} live items
        </span>
      </div>
    </section>

    <section class="surface">
      <ul class="todo-list">
        <li
          v-for="todo in todos"
          :key="todo.id"
          class="todo-item"
        >
          <strong>{{ todo.text }}</strong>
          <span class="hint">{{ todo.completed ? 'Complete' : 'Open' }}</span>
        </li>
      </ul>
    </section>
  </main>
</template>
