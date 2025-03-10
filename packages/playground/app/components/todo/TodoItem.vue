<script lang="ts" setup>
const props = defineProps<{
  id: string
}>()

const store = useStore()
const { data: todo } = await store.Todo.queryFirst(props.id)

async function toggle() {
  if (!todo.value) {
    return
  }

  // await store.Todo.update({
  //   id: todo.value.id,
  //   completed: !todo.value.completed,
  // })
  await todo.value.$update({
    completed: !todo.value.completed,
  })
}

const timeAgo = useTimeAgo(() => todo.value?.createdAt ?? 0)

const editOpen = ref(false)
</script>

<template>
  <div
    v-if="todo"
    class="todo flex items-center p-4 gap-4 hover:bg-primary-500/5 rounded-md cursor-pointer select-none"
    :class="{
      'opacity-50': todo.completed,
    }"
    @click="toggle()"
  >
    <input
      type="checkbox"
      :checked="todo.completed"
    >
    <span
      class="flex-1"
      :class="{
        'line-through': todo.completed,
      }"
    >
      {{ todo.text }}
    </span>

    <span class="opacity-50">{{ timeAgo }}</span>

    <UPopover
      v-model:open="editOpen"
      :content="{
        align: 'end',
      }"
    >
      <UButton
        icon="lucide:pen"
        variant="soft"
        size="sm"
        @click.stop
      />

      <template #content>
        <div class="p-4">
          <TodoEditForm
            :id="todo.id"
            @close="editOpen = false"
          />
        </div>
      </template>
    </UPopover>

    <UButton
      icon="lucide:trash"
      color="error"
      variant="soft"
      size="sm"
      @click.stop="store.Todo.delete(todo.id)"
    />
  </div>
</template>
