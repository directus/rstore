<script setup lang="ts">
import { useStore } from '@rstore/vue'

const store = useStore()
const { data: todos, loading, refresh } = await store.Todo.query(q => q.many())
</script>

<template>
  <main class="tutorial-app">
    <header class="hero">
      <h1>Todo inbox</h1>
      <p>The list, loading badge, and refresh button now all come from one reactive query.</p>
    </header>

    <section class="surface">
      <div class="toolbar">
        <button @click="refresh()">
          Refresh
        </button>

        <span class="meta-pill">
          {{ loading ? 'Refreshing from the memory backend…' : `${todos.length} todos rendered` }}
        </span>
      </div>
    </section>

    <section class="surface">
      <ul class="todo-list">
        <li
          v-for="todo in todos"
          :key="todo.id"
          class="todo-item"
          :class="{ done: todo.completed }"
        >
          <strong>{{ todo.text }}</strong>
          <span class="hint">{{ todo.completed ? 'Already complete' : 'Still in progress' }}</span>
        </li>
      </ul>
    </section>
  </main>
</template>
