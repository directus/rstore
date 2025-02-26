<script lang="ts" setup>
const props = defineProps<{
  id: string
}>()

const emit = defineEmits<{
  close: []
}>()

const store = useVanillaStore()

const updateTodo = await store.Todo.updateForm(props.id)
updateTodo.$onSaved(() => emit('close'))
</script>

<template>
  <UForm
    :state="updateTodo"
    :schema="updateTodo.$schema"
    class="flex flex-col gap-4"
    @submit="updateTodo.$save()"
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

    <div class="flex items-center gap-4">
      <UButton
        type="button"
        icon="lucide:rotate-ccw"
        color="neutral"
        variant="soft"
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
      />
    </div>
  </UForm>
</template>
