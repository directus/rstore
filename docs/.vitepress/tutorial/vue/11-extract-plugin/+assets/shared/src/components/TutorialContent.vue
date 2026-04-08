<script setup lang="ts">
import { useStore } from '@rstore/vue'

const store = useStore()
const { data: todos, loading, refresh } = await store.Todo.query(q => q.many())
</script>

<template>
  <main class="tutorial-app app-shell">
    <header class="hero">
      <div class="panel-header">
        <div class="hero-head">
          <p class="eyebrow">Transport plugin</p>
          <h1>Shared task transport</h1>
          <p>Move backend transport into a reusable memory plugin so the collection files stay focused on the task model.</p>
        </div>

        <span class="meta-pill">{{ todos.length }} seeded tasks</span>
      </div>
    </header>

    <section class="surface">
      <div class="toolbar">
        <button class="ghost" @click="refresh()">
          Refresh
        </button>

        <span class="meta-pill">
          {{ loading ? 'Refreshing through the plugin…' : 'The board is reading through the extracted transport layer' }}
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
          <span class="todo-mark" :data-complete="todo.completed ? 'true' : 'false'" />

          <div class="todo-copy">
            <strong>{{ todo.text }}</strong>
            <span class="hint">Assigned to {{ todo.assigneeId ?? 'nobody yet' }}</span>
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>
