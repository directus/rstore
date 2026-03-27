<script setup lang="ts">
import { useStore } from '@rstore/vue'
import { simulateRemoteTodo as triggerRemoteTodo } from '../rstore/live'

const store = useStore()
const { data: todos } = await store.Todo.query(q => q.many())

async function simulateRemoteTodo() {
  triggerRemoteTodo()
  await new Promise(resolve => window.setTimeout(resolve, 80))
}
</script>

<template>
  <main class="tutorial-app">
    <header class="hero">
      <h1>Chapter : Live Query</h1>
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
