<script setup lang="ts">
import { useStore } from '@rstore/vue'

const store = useStore()
await store.User.findMany()
const { data: todos } = await store.Todo.query(q => q.many())
</script>

<template>
  <main class="tutorial-app app-shell">
    <header class="hero">
      <div class="panel-header">
        <div class="hero-head">
          <p class="eyebrow">Relations</p>
          <h1>Assigned task board</h1>
          <p>Resolve <code>todo.assignee</code> directly from the normalized cache so the board can show the real teammate behind each task.</p>
        </div>

        <span class="meta-pill">{{ todos.length }} tasks with assignees</span>
      </div>
    </header>

    <section class="surface">
      <ul class="todo-list">
        <li
          v-for="todo in todos"
          :key="todo.id"
          class="todo-item"
        >
          <span class="todo-mark" :data-complete="todo.completed ? 'true' : 'false'" />

          <div class="todo-copy">
            <strong>{{ todo.text }}</strong>
            <span class="hint">
              Assignee: {{ todo.assignee?.name ?? 'Missing relation mapping' }}
            </span>
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>
