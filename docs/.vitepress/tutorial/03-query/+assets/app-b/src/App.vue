<script setup lang="ts">
import { useStore } from '@rstore/vue'
import { watchEffect } from 'vue'
import { reportTodoList } from './tutorial/reporting'

const store = useStore()
const { data: todos, loading, refresh } = await store.Todo.query(q => q.many())

watchEffect(() => {
  reportTodoList(todos.value)
})
</script>

<template>
  <main class="tutorial-app">
    <header class="hero">
      <h1>Step 3: Query</h1>
      <p>Reactive queries keep the list in sync with the normalized cache.</p>
    </header>

    <section class="surface">
      <div class="toolbar">
        <button @click="refresh()">
          Refresh
        </button>

        <span class="meta-pill">
          {{ loading ? 'Loading from the memory backend…' : `${todos.length} todos rendered` }}
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
