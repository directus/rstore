<script setup lang="ts">
import { useStore } from '@rstore/vue'
import { watchEffect } from 'vue'
import { setTutorialState } from './tutorial/bridge'

const store = useStore()
const { data: todos, loading, refresh } = await store.Todo.query(q => q.many())

watchEffect(() => {
  setTutorialState({
    listCount: todos.value.length,
    todoTexts: todos.value.map(todo => todo.text),
  })
})
</script>

<template>
  <main class="tutorial-app">
    <header class="hero">
      <h1>Step 1: Collections</h1>
      <p>Define the Todo collection and expose the seeded in-memory list through collection hooks.</p>
    </header>

    <section class="surface">
      <div class="toolbar">
        <button @click="refresh()">
          Refresh
        </button>

        <span class="meta-pill">
          {{ loading ? 'Loading the in-memory backend…' : todos.length + ' seeded todos ready' }}
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
