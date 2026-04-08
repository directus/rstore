<script setup lang="ts">
import { ref } from 'vue'

const loading = ref(false)
const todos = ref<Array<{ id: string, text: string, completed: boolean }>>([])

async function refresh() {
}
</script>

<template>
  <main class="tutorial-app app-shell">
    <header class="hero">
      <div class="panel-header">
        <div class="hero-head">
          <p class="eyebrow">Query a list</p>
          <h1>Inbox</h1>
          <p>Wire one store query into the page so the board can render the current tasks and report when it is fetching fresh data.</p>
        </div>

        <span class="meta-pill">{{ todos.length }} tasks on screen</span>
      </div>
    </header>

    <section class="surface">
      <div class="toolbar">
        <button class="ghost" @click="refresh()">
          Refresh
        </button>

        <span class="meta-pill">
          {{ loading ? 'Loading tasks…' : 'The list is ready for the store query' }}
        </span>
      </div>
    </section>

    <section class="surface">
      <div v-if="!todos.length" class="empty-state">
        No todos are showing yet.
      </div>

      <ul v-else class="todo-list">
        <li
          v-for="todo in todos"
          :key="todo.id"
          class="todo-item"
        >
          <span class="todo-mark" :data-complete="todo.completed ? 'true' : 'false'" />

          <div class="todo-copy">
            <strong>{{ todo.text }}</strong>
            <span class="hint">{{ todo.completed ? 'Completed already' : 'Still waiting for the first query result' }}</span>
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>
