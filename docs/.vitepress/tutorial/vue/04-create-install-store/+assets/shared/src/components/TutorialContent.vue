<script setup lang="ts">
import { useStore } from '@rstore/vue'

const store = useStore()
const { data: todos, loading, refresh } = await store.Todo.query(q => q.many())
</script>

<template>
  <main class="tutorial-app">
    <header class="hero">
      <h1>Chapter : Store Setup</h1>
      <p>Create the store and install `RstorePlugin` so `useStore()` becomes available to components.</p>
    </header>

    <section class="surface">
      <div class="toolbar">
        <button @click="refresh()">
          Refresh
        </button>

        <span class="meta-pill">
          {{ loading ? 'Loading the in-memory backend…' : `${todos.length} seeded todos ready` }}
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
          <span class="hint">Assigned to {{ todo.assigneeId ?? 'nobody yet' }}</span>
        </li>
      </ul>
    </section>
  </main>
</template>
