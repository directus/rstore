<script setup lang="ts">
import { useStore } from '@rstore/vue'
import TodoForm from './components/TodoForm.vue'

const store = useStore()
const { data: todos } = await store.Todo.query(q => q.many())
</script>

<template>
  <main class="tutorial-app">
    <header class="hero">
      <h1>Chapter : Form Objects</h1>
      <p>Use <code>createForm()</code> and <code>updateForm()</code> to manage form state without leaving rstore.</p>
    </header>

    <section class="split">
      <TodoForm class="surface" :edit-id="todos[0]?.id ?? null" />

      <section class="surface">
        <h2>Current todos</h2>

        <ul class="summary-list">
          <li
            v-for="todo in todos"
            :key="todo.id"
            class="summary-item"
          >
            <strong>{{ todo.text }}</strong>
            <span class="hint">{{ todo.completed ? 'Complete' : 'Open' }}</span>
          </li>
        </ul>
      </section>
    </section>
  </main>
</template>
