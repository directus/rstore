<script setup lang="ts">
const store = useStore()
const { data: todos, loading, refresh } = await store.Todo.query(q => q.many())
</script>

<template>
  <main class="tutorial-app">
    <header class="hero">
      <h1>Nuxt inbox</h1>
      <p>The page now reads, refreshes, and reports loading from one store query.</p>
    </header>

    <section class="surface">
      <div class="toolbar">
        <button @click="refresh()">
          Refresh
        </button>

        <span class="meta-pill">
          {{ loading ? 'Refreshing from the Nuxt routes…' : `${todos.length} todos rendered` }}
        </span>
      </div>
    </section>

    <section class="surface">
      <ul class="todo-list">
        <li v-for="todo in todos" :key="todo.id" class="todo-item" :class="{ done: todo.completed }">
          <strong>{{ todo.text }}</strong>
          <span class="hint">{{ todo.completed ? 'Already complete' : 'Still in progress' }}</span>
        </li>
      </ul>
    </section>
  </main>
</template>
