<script setup lang="ts">
const store = useStore()
const { data: todos } = await store.Todo.query(q => q.many())
</script>

<template>
  <main class="tutorial-app">
    <header class="hero">
      <h1>Nuxt cache APIs</h1>
      <p>Use direct cache helpers without leaving the app.</p>
    </header>

    <section class="split">
      <CachePanel class="surface" />

      <section class="surface">
        <h2>Current todos</h2>

        <ul class="summary-list">
          <li v-for="todo in todos" :key="todo.id" class="summary-item">
            <strong>{{ todo.text }}</strong>
            <span class="hint">{{ todo.completed ? 'Complete' : 'Open' }}</span>
          </li>
        </ul>
      </section>
    </section>
  </main>
</template>
