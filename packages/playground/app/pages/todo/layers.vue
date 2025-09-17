<script lang="ts" setup>
import type { CacheLayer } from '@rstore/shared'

const store = useStore()

const { data: todos, refresh } = await store.Todo.query(q => q.many())

const createTodo = store.Todo.createForm()
const createInput = useTemplateRef('input')
createTodo.$onSuccess(() => {
  createInput.value?.inputRef?.focus()
  createInput.value?.inputRef?.select()
})

const addedItemLayer = {
  id: 'todo:addedItems',
  state: {
    Todo: {
      'new-from-layer': {
        $overrideKey: 'new-from-layer',
        text: 'This todo was added from a layer',
        completed: false,
        createdAt: new Date(),
      } satisfies Omit<StoreResolvedCollectionItem<'Todo'>, 'id'> & { $overrideKey: string },
    },
  },
  deletedItems: {},
  optimistic: true,
} satisfies CacheLayer

const modifyItemLayer = {
  id: 'todo:modifyItems',
  state: {
    Todo: {},
  },
  deletedItems: {},
  optimistic: true,
} satisfies CacheLayer

function addModifyItemLayer() {
  const firstTodo = todos.value.find(t => !t.$isOptimistic)
  if (firstTodo) {
    modifyItemLayer.state.Todo = {
      [firstTodo.id]: {
        id: firstTodo.id,
        text: `${firstTodo.text} (modified by a layer)`,
        completed: !firstTodo.completed,
      } satisfies Partial<StoreResolvedCollectionItem<'Todo'>> & Pick<StoreResolvedCollectionItem<'Todo'>, 'id'>,
    }
    store.$cache.addLayer(modifyItemLayer)
  }
}

const deleteItemLayer = {
  id: 'todo:deleteItems',
  state: {},
  deletedItems: {
    Todo: new Set<string | number>(),
  },
  optimistic: true,
} satisfies CacheLayer

function addDeleteItemLayer() {
  const firstTodo = todos.value.find(t => !t.$isOptimistic)
  if (firstTodo) {
    deleteItemLayer.deletedItems.Todo = new Set([firstTodo.id])
    store.$cache.addLayer(deleteItemLayer)
  }
}

const skippedLayer = {
  id: 'todo:skippedLayer',
  state: {
    Todo: {
      'new-from-layer2': {
        $overrideKey: 'new-from-layer2',
        text: 'This will not be applyed',
        completed: false,
        createdAt: new Date(),
      } satisfies Omit<StoreResolvedCollectionItem<'Todo'>, 'id'> & { $overrideKey: string },
    },
  },
  deletedItems: {},
  optimistic: false,
  skip: true,
} satisfies CacheLayer
</script>

<template>
  <div class="m-4 p-4 border border-default rounded-xl flex flex-wrap gap-2">
    <UButton
      v-if="!store.$cache.getLayer(addedItemLayer.id)"
      variant="outline"
      icon="lucide:plus"
      @click="store.$cache.addLayer(addedItemLayer)"
    >
      Add a layer that adds a todo
    </UButton>

    <UButton
      v-else
      variant="outline"
      color="error"
      icon="lucide:x"
      @click="store.$cache.removeLayer(addedItemLayer.id)"
    >
      Remove the layer that adds a todo
    </UButton>

    <UButton
      v-if="!store.$cache.getLayer(modifyItemLayer.id)"
      variant="outline"
      icon="lucide:edit-2"
      @click="addModifyItemLayer()"
    >
      Add a layer that modifies the first todo
    </UButton>

    <UButton
      v-else
      variant="outline"
      color="error"
      icon="lucide:x"
      @click="store.$cache.removeLayer(modifyItemLayer.id)"
    >
      Remove the layer that modifies the first todo
    </UButton>

    <UButton
      v-if="!store.$cache.getLayer(deleteItemLayer.id)"
      variant="outline"
      icon="lucide:trash"
      @click="addDeleteItemLayer()"
    >
      Add a layer that deletes the first todo
    </UButton>

    <UButton
      v-else
      variant="outline"
      color="error"
      icon="lucide:x"
      @click="store.$cache.removeLayer(deleteItemLayer.id)"
    >
      Remove the layer that deletes the first todo
    </UButton>

    <UButton
      v-if="!store.$cache.getLayer(skippedLayer.id)"
      variant="outline"
      icon="lucide:fast-forward"
      @click="store.$cache.addLayer(skippedLayer)"
    >
      Add a skipped layer that adds a todo (will not be applied)
    </UButton>

    <UButton
      v-else
      variant="outline"
      color="error"
      icon="lucide:x"
      @click="store.$cache.removeLayer(skippedLayer.id)"
    >
      Remove the skipped layer
    </UButton>
  </div>

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
          placeholder="What needs to be done?"
          autofocus
          class="w-full"
          @keydown.enter.prevent="createTodo.$submit()"
        />

        <UButton
          type="submit"
          icon="lucide:plus"
          label="Add"
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

    <TodoItem
      v-for="todo in todos"
      :id="todo.$getKey()"
      :key="todo.$getKey()"
    />

    <div class="mt-2 opacity-50 text-center">
      {{ todos.length }} item{{ todos.length !== 1 ? 's' : '' }}
    </div>

    <div v-if="!todos.length" class="text-center text-gray-500 p-12">
      Nothing here yet
    </div>
  </div>

  <Output :data="todos" title="todos" />
</template>
