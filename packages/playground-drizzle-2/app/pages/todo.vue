<script lang="ts" setup>
const store = useStore()

const { data: todos } = await store.todos.query(q => q.many())

const createTodo = store.todos.createForm()
const createInput = useTemplateRef('input')
createTodo.$onSuccess(() => {
  createInput.value?.inputRef?.focus()
  createInput.value?.inputRef?.select()
})
</script>

<template>
  <div class="m-4 p-4 border border-default rounded-xl flex flex-col gap-px">
    <UForm
      :state="createTodo"
      :schema="createTodo.$schema"
      class="mb-4"
      @submit="createTodo.$submit()"
    >
      <UButtonGroup
        class="w-full"
      >
        <UInput
          ref="input"
          v-model="createTodo.title"
          placeholder="What needs to be done?"
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
        />
      </UButtonGroup>
    </UForm>

    <TodoItem
      v-for="{ id } in todos"
      :id
      :key="id"
    />

    <div v-if="!todos.length" class="text-center text-gray-500 p-12">
      Nothing here yet
    </div>
  </div>
</template>
