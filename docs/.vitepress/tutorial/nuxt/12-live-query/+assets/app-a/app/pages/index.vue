<script setup lang="ts">
import { simulateRemoteTodo } from '~~/app/rstore/live'

const store = useStore()
const { data: todos } = await store.Todo.query(q => q.many())

async function simulateRemote() {
  simulateRemoteTodo()
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
          <p>The page still uses a normal query, so remote events do not reach the board yet.</p>
        </div>

        <span class="meta-pill">{{ todos.length }} live rows</span>
      </div>
    </header>

    <section class="surface">
      <div class="toolbar">
        <button @click="simulateRemote()">
          Simulate remote task
        </button>

        <span class="meta-pill">
          Waiting for live query wiring
        </span>
      </div>
    </section>

    <section class="surface">
      <ul class="todo-list">
        <li v-for="todo in todos" :key="todo.id" class="todo-item">
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
