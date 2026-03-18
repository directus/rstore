<script setup lang="ts">
import { useStore } from '@rstore/vue'

const props = defineProps<{
  editId: string | null
}>()

const store = useStore()
const createTodo = store.Todo.createForm()
const updateTodo = props.editId ? await store.Todo.updateForm(props.editId) : null
</script>

<template>
  <section class="stack">
    <div class="stack">
      <h2>Create form</h2>
      <span class="meta-pill">{{ createTodo.$valid ? 'Valid' : 'Needs text' }}</span>
    </div>

    <label class="label">
      <span>Todo text</span>
      <input v-model="createTodo.text" placeholder="Draft the welcome email">
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
        <input v-model="updateTodo.text" placeholder="Rename the task">
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
