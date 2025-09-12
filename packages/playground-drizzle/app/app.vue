<script lang="ts" setup>
useHead({
  title: 'Rstore Nuxt Drizzle Playground',
})

const store = useStore()

const filter = ref<'all' | 'unfinished' | 'finished'>('all')
const page = ref(0)
const { data: todos, loading } = await store.todos.query(q => q.many({
  where: filter.value === 'all' ? undefined : eq('completed', Number(filter.value === 'finished')),
  params: {
    limit: 10,
    offset: page.value * 10,
    // columns: {
    //   title: false,
    // },
    orderBy: [
      // 'completed.asc',
      'createdAt.desc',
    ],
  },
}))

const createTodo = store.todos.createForm()
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

    <UButton
      label="Load more"
      color="neutral"
      variant="soft"
      :loading
      block
      @click="page++"
    />

    <div v-if="!todos.length" class="text-center text-gray-500 p-12">
      Nothing here yet
    </div>
  </div>
</template>
