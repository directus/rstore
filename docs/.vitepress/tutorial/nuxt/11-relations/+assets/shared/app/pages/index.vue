<script setup lang="ts">
const store = useStore()
await store.User.findMany()
const { data: todos } = await store.Todo.query(q => q.many())
</script>

<template>
  <main class="tutorial-app">
    <header class="hero">
      <h1>Nuxt relations</h1>
      <p>Resolve related users directly from the cache.</p>
    </header>

    <section class="surface">
      <ul class="todo-list">
        <li v-for="todo in todos" :key="todo.id" class="todo-item">
          <strong>{{ todo.text }}</strong>
          <span class="hint">Assignee: {{ todo.assignee?.name ?? 'Missing relation mapping' }}</span>
        </li>
      </ul>
    </section>
  </main>
</template>
