<script lang="ts" setup>
useHead({
  title: 'Rstore Nuxt Directus Playground',
})

const store = useStore()

const filter = ref<'all' | 'unfinished' | 'finished'>('all')
const { data: todos } = await store.Todos.queryMany(() => ({
  filter: filter.value === 'all'
    ? undefined
    : {
        completed: {
          _eq: filter.value === 'finished',
        },
      },
}))

const createTodo = store.Todos.createForm()
const createInput = useTemplateRef('input')
createTodo.$onSuccess(() => {
  createInput.value?.inputRef?.focus()
  createInput.value?.inputRef?.select()
})
</script>

<template>
  <div class="m-4 p-4 border border-default rounded-xl flex flex-col gap-px">
    <div class="flex items-center gap-4 mb-4">
      <UForm
        :state="createTodo"
        :schema="createTodo.$schema"
        class="flex-1 min-w-0"
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

      <UButtonGroup
        size="xl"
      >
        <UButton
          label="All"
          color="neutral"
          :variant="filter === 'all' ? 'subtle' : 'outline'"
          @click="filter = 'all'"
        />
        <UButton
          label="Unfinished"
          color="neutral"
          :variant="filter === 'unfinished' ? 'subtle' : 'outline'"
          @click="filter = 'unfinished'"
        />
        <UButton
          label="Finished"
          color="neutral"
          :variant="filter === 'finished' ? 'subtle' : 'outline'"
          @click="filter = 'finished'"
        />
      </UButtonGroup>
    </div>

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
