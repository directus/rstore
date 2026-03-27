<script setup lang="ts">
import { useStore } from '@rstore/vue'
import CachePanel from './CachePanel.vue'

const store = useStore()
const { data: todos } = await store.Todo.query(q => q.many())
</script>

<template>
  <main class="tutorial-app">
    <header class="hero">
      <h1>Chapter : Cache</h1>
      <p>Read, write, and clear the normalized cache directly.</p>
    </header>

    <section class="split">
      <CachePanel class="surface" />

      <section class="surface">
        <h2>Reactive query view</h2>

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
