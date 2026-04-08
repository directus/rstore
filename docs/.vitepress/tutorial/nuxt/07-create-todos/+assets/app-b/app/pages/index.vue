<script setup lang="ts">
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
  <main class="tutorial-app app-shell">
    <header class="hero">
      <h1>Tasks</h1>
    </header>

    <section class="surface">
      <div class="form-row">
        <input
          v-model="inputText"
          placeholder="Add a task"
          @keydown.enter.prevent="addTodo(inputText)"
        >

        <button @click="addTodo(inputText)">
          Add
        </button>
      </div>
    </section>

    <section class="surface">
      <div v-if="!todos.length" class="empty-state">
        No tasks yet.
      </div>

      <ul v-else class="todo-list">
        <li v-for="todo in todos" :key="todo.id" class="todo-item" :class="{ done: todo.completed }">
          <label class="todo-toggle">
            <input
              class="todo-checkbox"
              type="checkbox"
              :checked="todo.completed"
              @change="toggleTodo(todo.id)"
            >

            <div class="todo-copy">
              <strong>{{ todo.text }}</strong>
            </div>
          </label>

          <div class="todo-actions">
            <button class="ghost" @click="removeTodo(todo.id)">
              Delete
            </button>
          </div>
        </li>
      </ul>
    </section>
  </main>
</template>
