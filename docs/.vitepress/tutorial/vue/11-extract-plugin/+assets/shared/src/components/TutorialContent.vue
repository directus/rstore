<script setup lang="ts">
import { useStore } from '@rstore/vue'

const store = useStore()
const { data: todos, loading, refresh } = await store.Todo.query(q => q.many())
</script>

<template>
  <main class="tutorial-app">
    <header class="hero">
      <h1>Chapter : Plugin Setup</h1>
      <p>Move the transport out of collection hooks and into a reusable memory plugin.</p>
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
