<script setup lang="ts">
const store = useStore()
const inputText = ref('')
const { data: todos } = await store.Todo.query(q => q.many())

async function addTodo(_text: string) {}

async function toggleTodo(_id: string) {}

async function removeTodo(_id: string) {}
</script>

<template>
  <main class="tutorial-app">
    <header class="hero">
      <h1>Nuxt team tasks</h1>
      <p>Teach the page how to add, update, and remove todos without leaving the query-driven view.</p>
    </header>

    <section class="surface">
      <div class="form-row">
        <input
          v-model="inputText"
          placeholder="Plan the sprint review"
          @keydown.enter.prevent="addTodo(inputText)"
        >

        <button @click="addTodo(inputText)">
          Add todo
        </button>
      </div>
    </section>

    <section class="surface">
      <ul class="todo-list">
        <li v-for="todo in todos" :key="todo.id" class="todo-item" :class="{ done: todo.completed }">
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
