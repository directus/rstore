<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { reportTodoList } from './tutorial/reporting'

const loading = ref(false)
const todos = ref<Array<{ id: string, text: string, completed: boolean }>>([])

async function refresh() {
}

watchEffect(() => {
  reportTodoList(todos.value)
})
</script>

<template>
  <main class="tutorial-app">
    <header class="hero">
      <h1>Step 3: Query</h1>
      <p>Replace the placeholder state with <code>store.Todo.query(q =&gt; q.many())</code>.</p>
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
        Your query is still returning an empty list.
      </div>

      <ul v-else class="todo-list">
        <li
          v-for="todo in todos"
          :key="todo.id"
          class="todo-item"
        >
          {{ todo.text }}
        </li>
      </ul>
    </section>
  </main>
</template>
