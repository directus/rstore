<script setup lang="ts">
import { useStore } from '@rstore/vue'
import { ref } from 'vue'

const store = useStore()
const inputText = ref('')

const { data: todos } = await store.Todo.query(q => q.many())

async function addTodo(text: string) {
  const value = text.trim()

  if (!value) {
    return
  }

  await store.Todo.create({
    text: value,
    completed: false,
    assigneeId: 'user-1',
  })

  inputText.value = ''
}

async function toggleTodo(id: string) {
  const todo = todos.value.find(item => item.id === id)

  if (!todo) {
    return
  }

  await todo.$update({
    completed: !todo.completed,
  })
}

async function removeTodo(id: string) {
  await store.Todo.delete(id)
}
</script>

<template>
  <main class="tutorial-app">
    <header class="hero">
      <h1>Team tasks</h1>
      <p>The list can now create, toggle, and remove todos directly through the collection API.</p>
    </header>

    <section class="surface">
      <div class="form-row">
        <input
          v-model="inputText"
          placeholder="Plan the release"
          @keydown.enter.prevent="addTodo(inputText)"
        >

        <button @click="addTodo(inputText)">
          Add todo
        </button>
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
          <strong>{{ todo.text }}</strong>

          <div class="todo-actions">
            <button class="secondary" @click="toggleTodo(todo.id)">
              {{ todo.completed ? 'Mark open' : 'Complete' }}
            </button>

            <button class="ghost" @click="removeTodo(todo.id)">
              Delete
            </button>
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>
