<script setup lang="ts">
const store = useStore()
const { data: todos, loading, refresh } = await store.Todo.query(q => q.many())
</script>

<template>
  <main class="tutorial-app app-shell">
    <header class="hero">
      <div class="panel-header">
        <div class="hero-head">
          <p class="eyebrow">Query in a page</p>
          <h1>Inbox</h1>
          <p>The page now reads, refreshes, and reports loading from one store query.</p>
        </div>

        <span class="meta-pill">{{ todos.length }} tasks loaded</span>
      </div>
    </header>

    <section class="surface">
      <div class="toolbar">
        <button class="ghost" @click="refresh()">
          Refresh
        </button>

        <span class="meta-pill">
          {{ loading ? 'Refreshing from the Nuxt routes…' : 'The board is reading from one shared query result' }}
        </span>
      </div>
    </section>

    <section class="surface">
      <ul class="todo-list">
        <li v-for="todo in todos" :key="todo.id" class="todo-item" :class="{ done: todo.completed }">
          <span class="todo-mark" :data-complete="todo.completed ? 'true' : 'false'" />

          <div class="todo-copy">
            <strong>{{ todo.text }}</strong>
            <span class="hint">{{ todo.completed ? 'Already complete' : 'Still in progress' }}</span>
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>
