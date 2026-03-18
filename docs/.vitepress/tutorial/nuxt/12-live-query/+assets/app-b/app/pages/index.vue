<script setup lang="ts">
import { simulateRemoteTodo } from '~~/app/rstore/live'

const store = useStore()
const { data: todos } = await store.Todo.liveQuery(q => q.many())

async function simulateRemote() {
  simulateRemoteTodo()
  await new Promise(resolve => window.setTimeout(resolve, 80))
}
</script>

<template>
  <main class="tutorial-app">
    <header class="hero">
      <h1>Nuxt live query</h1>
      <p>Use `liveQuery()` so remote events update the page automatically.</p>
    </header>

    <section class="surface">
      <div class="toolbar">
        <button @click="simulateRemote()">
          Simulate remote todo
        </button>

        <span class="meta-pill">
          {{ todos.length }} live items
        </span>
      </div>
    </section>

    <section class="surface">
      <ul class="todo-list">
        <li v-for="todo in todos" :key="todo.id" class="todo-item">
          <strong>{{ todo.text }}</strong>
          <span class="hint">{{ todo.completed ? 'Complete' : 'Open' }}</span>
        </li>
      </ul>
    </section>
  </main>
</template>
