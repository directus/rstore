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
  <main class="tutorial-app app-shell">
    <header class="hero">
      <div class="panel-header">
        <div class="hero-head">
          <p class="eyebrow">Live updates</p>
          <h1>Shared inbox</h1>
          <p>Use <code>liveQuery()</code> so remote inserts land in the board automatically instead of waiting for a manual refresh.</p>
        </div>

        <span class="meta-pill">{{ todos.length }} live rows</span>
      </div>
    </header>

    <section class="surface">
      <div class="toolbar">
        <button @click="simulateRemoteTodo()">
          Simulate remote task
        </button>

        <span class="meta-pill">
          Waiting for live query wiring
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
          <span class="todo-mark" :data-complete="todo.completed ? 'true' : 'false'" />

          <div class="todo-copy">
            <strong>{{ todo.text }}</strong>
            <span class="hint">{{ todo.completed ? 'Complete' : 'Open' }}</span>
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>
