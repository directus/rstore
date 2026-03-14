<script setup lang="ts">
import { useStore } from '@rstore/vue'
import { ref, watchEffect } from 'vue'
import { registerTutorialAction } from './tutorial/bridge'
import { reportMutationState } from './tutorial/reporting'

const store = useStore()
const inputText = ref('')
const mutationState = ref({
  created: false,
  toggled: false,
  deleted: false,
})

const { data: todos } = await store.Todo.query(q => q.many())

async function addTodo(text: string) {
  inputText.value = text
}

async function toggleTodo(id: string) {
  return id
}

async function removeTodo(id: string) {
  return id
}

registerTutorialAction('mutation-smoke', async () => {
  mutationState.value = {
    created: false,
    toggled: false,
    deleted: false,
  }

  const probeText = 'Verify the mutation step'
  await addTodo(probeText)

  const createdTodo = todos.value.find(todo => todo.text === probeText)

  if (!createdTodo) {
    reportMutationState(todos.value, mutationState.value)
    return
  }

  await toggleTodo(createdTodo.id)
  await removeTodo(createdTodo.id)
  reportMutationState(todos.value, mutationState.value)
})

watchEffect(() => {
  reportMutationState(todos.value, mutationState.value)
})
</script>

<template>
  <main class="tutorial-app">
    <header class="hero">
      <h1>Step 4: Mutation</h1>
      <p>Create a todo, toggle its completion state, and then delete it again.</p>
    </header>

    <section class="surface">
      <div class="form-row">
        <input
          v-model="inputText"
          placeholder="Ship the mutation guide"
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
