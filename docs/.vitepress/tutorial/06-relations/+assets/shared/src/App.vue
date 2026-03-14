<script setup lang="ts">
import { useStore } from '@rstore/vue'
import { watchEffect } from 'vue'
import { setTutorialState } from './tutorial/bridge'

const store = useStore()
await store.User.findMany()
const { data: todos } = await store.Todo.query(q => q.many())

watchEffect(() => {
  setTutorialState({
    listCount: todos.value.length,
    todoTexts: todos.value.map(todo => todo.text),
    relations: {
      assigneeNames: todos.value
        .map(todo => todo.assignee?.name)
        .filter((name): name is string => Boolean(name)),
    },
  })
})
</script>

<template>
  <main class="tutorial-app">
    <header class="hero">
      <h1>Step 6: Relations</h1>
      <p>Resolve <code>todo.assignee</code> straight from the normalized cache.</p>
    </header>

    <section class="surface">
      <ul class="todo-list">
        <li
          v-for="todo in todos"
          :key="todo.id"
          class="todo-item"
        >
          <strong>{{ todo.text }}</strong>
          <span class="hint">
            Assignee: {{ todo.assignee?.name ?? 'Missing relation mapping' }}
          </span>
        </li>
      </ul>
    </section>
  </main>
</template>
