<script setup lang="ts">
import { useStore } from '@rstore/vue'
import { watchEffect } from 'vue'
import { registerTutorialAction } from '../tutorial/bridge'
import { reportFormState } from '../tutorial/reporting'

const props = defineProps<{
  editId: string | null
}>()

const store = useStore()
const createTodo = store.Todo.createForm()
const updateTodo = props.editId ? await store.Todo.updateForm(props.editId) : null

watchEffect(() => {
  reportFormState({
    ready: Boolean(updateTodo),
    valid: createTodo.$valid,
    hasChanges: updateTodo?.$hasChanges() ?? false,
  })
})

registerTutorialAction('form-smoke', async () => {
  let created = false
  let updated = false
  let resetWorked = false

  createTodo.text = 'Practice createForm'
  createTodo.assigneeId = 'user-1'
  await createTodo.$submit()
  created = true

  if (updateTodo) {
    updateTodo.text = 'Updated from updateForm'
    const hadChanges = updateTodo.$hasChanges()
    updateTodo.$reset()
    resetWorked = hadChanges && !updateTodo.$hasChanges()
    updateTodo.text = 'Updated from updateForm'
    await updateTodo.$submit()
    updated = true
  }

  reportFormState({
    ready: Boolean(updateTodo),
    valid: createTodo.$valid,
    hasChanges: updateTodo?.$hasChanges() ?? false,
    created,
    updated,
    resetWorked,
  })
})
</script>

<template>
  <section class="stack">
    <div class="stack">
      <h2>Create form</h2>
      <span class="meta-pill">{{ createTodo.$valid ? 'Valid' : 'Needs text' }}</span>
    </div>

    <label class="label">
      <span>Todo text</span>
      <input v-model="createTodo.text" placeholder="Try createForm()">
    </label>

    <label class="label">
      <span>Assignee</span>
      <select v-model="createTodo.assigneeId">
        <option :value="null">
          Nobody yet
        </option>
        <option value="user-1">
          Ada Lovelace
        </option>
        <option value="user-2">
          Linus Torvalds
        </option>
        <option value="user-3">
          Grace Hopper
        </option>
      </select>
    </label>

    <div class="toolbar">
      <button :disabled="!createTodo.$valid" @click="createTodo.$submit()">
        Save
      </button>
    </div>

    <template v-if="updateTodo">
      <div class="stack">
        <h2>Edit form</h2>
        <span class="meta-pill">{{ updateTodo.$hasChanges() ? 'Unsaved changes' : 'In sync' }}</span>
      </div>

      <label class="label">
        <span>Existing todo text</span>
        <input v-model="updateTodo.text" placeholder="Use updateForm() here">
      </label>

      <div class="toolbar">
        <button class="secondary" @click="updateTodo.$reset()">
          Reset
        </button>

        <button :disabled="!updateTodo.$hasChanges()" @click="updateTodo.$submit()">
          Save changes
        </button>
      </div>
    </template>
  </section>
</template>
