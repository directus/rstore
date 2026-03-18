<script setup lang="ts">
import { ref } from 'vue'

const loading = ref(false)
const todos = ref<Array<{ id: string, text: string, completed: boolean }>>([])

function refresh() {}
</script>

<template>
  <main class="tutorial-app">
    <header class="hero">
      <h1>Nuxt inbox</h1>
      <p>Render the current todos from the store and keep the toolbar in sync with that fetch state.</p>
    </header>

    <section class="surface">
      <div class="toolbar">
        <button @click="refresh()">
          Refresh
        </button>

        <span class="meta-pill">
          {{ loading ? 'Loading…' : `${todos.length} todos rendered` }}
        </span>
      </div>
    </section>

    <section class="surface">
      <div v-if="!todos.length" class="hint">
        No todos are showing yet.
      </div>

      <ul v-else class="todo-list">
        <li v-for="todo in todos" :key="todo.id" class="todo-item">
          {{ todo.text }}
        </li>
      </ul>
    </section>
  </main>
</template>
