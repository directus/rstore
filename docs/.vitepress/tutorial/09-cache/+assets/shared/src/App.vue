<script setup lang="ts">
import { useStore } from '@rstore/vue'
import { watchEffect } from 'vue'
import CachePanel from './components/CachePanel.vue'
import { setTutorialState } from './tutorial/bridge'

const store = useStore()
const { data: todos } = await store.Todo.query(q => q.many())

watchEffect(() => {
  setTutorialState({
    listCount: todos.value.length,
    todoTexts: todos.value.map(todo => todo.text),
    cache: {
      count: todos.value.length,
    },
  })
})
</script>

<template>
  <main class="tutorial-app">
    <header class="hero">
      <h1>Step 9: Cache</h1>
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
