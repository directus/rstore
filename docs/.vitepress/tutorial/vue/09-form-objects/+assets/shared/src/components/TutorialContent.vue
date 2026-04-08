<script setup lang="ts">
import { useStore } from '@rstore/vue'
import TodoForm from './TodoForm.vue'

const store = useStore()
const { data: todos } = await store.Todo.query(q => q.many())
</script>

<template>
  <main class="tutorial-app app-shell">
    <header class="hero">
      <div class="panel-header">
        <div class="hero-head">
          <p class="eyebrow">Form objects</p>
          <h1>Draft and edit tasks</h1>
          <p>Use <code>createForm()</code> and <code>updateForm()</code> to manage editing state without leaving the store workflow.</p>
        </div>

        <span class="meta-pill">{{ todos.length }} tasks in view</span>
      </div>
    </header>

    <section class="split">
      <TodoForm class="surface" :edit-id="todos[0]?.id ?? null" />

      <section class="surface">
        <div class="panel-header">
          <div class="stack">
            <p class="section-label">Preview list</p>
            <h2>Current tasks</h2>
          </div>
        </div>

        <ul class="summary-list">
          <li
            v-for="todo in todos"
            :key="todo.id"
            class="summary-item"
          >
            <span class="todo-mark" :data-complete="todo.completed ? 'true' : 'false'" />

            <div class="todo-copy">
              <strong>{{ todo.text }}</strong>
              <span class="hint">{{ todo.completed ? 'Complete' : 'Open' }}</span>
            </div>
          </li>
        </ul>
      </section>
    </section>
  </main>
</template>
