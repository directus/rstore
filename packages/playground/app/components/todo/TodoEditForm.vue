<script lang="ts" setup>
const props = defineProps<{
  id: string
}>()

const emit = defineEmits<{
  close: []
}>()

const store = useStore()

const updateTodo = await store.Todo.updateForm(props.id)
updateTodo.$onSuccess(() => emit('close'))
updateTodo.$onChange((changes) => {
  // eslint-disable-next-line no-console
  console.log('Changes:', changes)
})
</script>

<template>
  <UForm
    :state="updateTodo"
    :schema="updateTodo.$schema"
    class="flex flex-col gap-4"
    @submit="updateTodo.$submit()"
  >
    <UFormField
      label="Text"
      name="text"
    >
      <UInput
        v-model="updateTodo.text"
        placeholder="What needs to be done?"
        autofocus
        class="w-full"
      />
    </UFormField>

    <UFormField
      name="completed"
    >
      <UCheckbox
        v-model="updateTodo.completed"
        label="Completed"
        class="w-full"
      />
    </UFormField>

    <div class="flex items-center gap-4">
      <UButton
        type="button"
        icon="lucide:rotate-ccw"
        color="neutral"
        variant="ghost"
        label="Reset"
        block
        :disabled="updateTodo.$loading"
        @click="updateTodo.$reset()"
      />
      <UButton
        type="button"
        icon="lucide:x"
        label="Cancel"
        color="neutral"
        variant="soft"
        block
        :disabled="updateTodo.$loading"
        @click="emit('close')"
      />
      <UButton
        type="submit"
        icon="lucide:check"
        label="Save"
        color="primary"
        block
        :loading="updateTodo.$loading"
        :disabled="!updateTodo.$hasChanges() || !updateTodo.$valid"
      />
    </div>

    <USeparator />

    <div class="text-xs flex flex-col gap-2">
      <div>Changed props:</div>

      <Output
        :data="updateTodo.$changedProps"
        class="!m-0"
      />

      <div class="flex gap-2">
        <UBadge
          :color="updateTodo.$valid ? 'success' : 'error'"
          :label="updateTodo.$valid ? 'Form Valid' : 'Form Invalid'"
          :icon="updateTodo.$valid ? 'lucide:check' : 'lucide:x'"
          variant="soft"
        />
        <UBadge
          :color="updateTodo.$hasChanges() ? 'info' : 'neutral'"
          :label="updateTodo.$hasChanges() ? 'Has changes' : 'No changes'"
          :icon="updateTodo.$hasChanges() ? 'lucide:square' : 'lucide:square-dashed'"
          variant="soft"
        />
      </div>
    </div>
  </UForm>
</template>
