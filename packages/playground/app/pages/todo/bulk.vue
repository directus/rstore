<script lang="ts" setup>
import { createFormObject } from '@rstore/vue'

const store = useStore()

const { data: todos, refresh } = await store.Todo.query(q => q.many())

const createTodo = createFormObject({
  defaultValues: () => ({
    text: '',
  }),
  submit: async (values) => {
    const data = { text: values.text ?? '' }
    const texts = data.text.split(',').map(t => t.trim()).filter(t => t.length > 0)
    await store.Todo.createMany(texts.map(text => ({ text })))
  },
})
const createInput = useTemplateRef('input')
createTodo.$onSuccess(() => {
  createInput.value?.inputRef?.focus()
  createInput.value?.inputRef?.select()
})

const selectedTodos = ref(new Set<string>())
</script>

<template>
  <div class="m-4 p-4 border border-default rounded-xl flex flex-col gap-px">
    <UForm
      :state="createTodo"
      :schema="createTodo.$schema"
      class="mb-4"
      @submit="createTodo()"
    >
      <UButtonGroup
        class="w-full"
      >
        <UInput
          ref="input"
          v-model="createTodo.text"
          placeholder="Separate multiple todos with commas"
          autofocus
          size="xl"
          class="w-full"
          @keydown.enter.prevent="createTodo.$submit()"
        />

        <UButton
          type="submit"
          icon="lucide:plus"
          label="Add"
          size="xl"
          :loading="createTodo.$loading"
          :disabled="!createTodo.$valid"
        />

        <UButton
          icon="lucide:refresh-cw"
          color="neutral"
          variant="soft"
          class="px-3"
          @click="refresh()"
        />
      </UButtonGroup>
    </UForm>

    <div>
      <UButtonGroup>
        <UButton
          v-bind="selectedTodos.size === todos.length
            ? {
              icon: 'lucide:minus',
              label: 'Deselect All',
            } : {
              icon: 'lucide:plus',
              label: 'Select All',
            }"
          variant="subtle"
          color="neutral"
          @click="() => {
            if (selectedTodos.size === todos.length) {
              selectedTodos.clear()
            }
            else {
              todos.forEach(todo => selectedTodos.add(todo.$getKey()))
            }
          }"
        />
        <UButton
          icon="lucide:check-check"
          label="Mark Completed"
          variant="subtle"
          color="success"
          :disabled="!selectedTodos.size"
          @click="() => {
            store.Todo.updateMany(Array.from(selectedTodos).map(key => ({
              id: key,
              completed: true,
            })))
          }"
        />
        <UButton
          icon="lucide:square"
          label="Mark Incomplete"
          variant="subtle"
          color="warning"
          :disabled="!selectedTodos.size"
          @click="() => {
            store.Todo.updateMany(Array.from(selectedTodos).map(key => ({
              id: key,
              completed: false,
            })))
          }"
        />

        <UButton
          icon="lucide:trash"
          label="Delete"
          variant="subtle"
          color="error"
          :disabled="!selectedTodos.size"
          @click="() => {
            store.Todo.deleteMany(Array.from(selectedTodos))
            selectedTodos.clear()
          }"
        />
      </UButtonGroup>
    </div>

    <div
      v-for="todo in todos"
      :id="todo.$getKey()"
      :key="todo.$getKey()"
      class="flex items-center p-4 gap-4 hover:bg-primary-500/5 rounded-md cursor-pointer select-none"
      @click="() => {
        if (!selectedTodos.has(todo.$getKey())) {
          selectedTodos.add(todo.$getKey())
        }
        else {
          selectedTodos.delete(todo.$getKey())
        }
      }"
    >
      <UCheckbox
        :model-value="selectedTodos.has(todo.$getKey())"
        name="selectedTodos"
        type="checkbox"
      />
      <div class="shrink" :class="{ 'line-through': todo.completed }">
        {{ todo.text }}
      </div>

      <UIcon
        v-if="todo.completed"
        name="lucide:check"
        class="text-primary"
      />

      <div class="flex-1" />
      <UBadge
        v-if="todo.$isOptimistic"
        label="Optimistic"
        color="info"
        icon="lucide:hourglass"
        size="sm"
      />
    </div>

    <pre>{{ selectedTodos }}</pre>

    <div class="mt-2 opacity-50 text-center">
      {{ todos.length }} item{{ todos.length !== 1 ? 's' : '' }}
    </div>

    <div v-if="!todos.length" class="text-center text-gray-500 p-12">
      Nothing here yet
    </div>
  </div>

  <Output :data="todos" title="todos" />
</template>
