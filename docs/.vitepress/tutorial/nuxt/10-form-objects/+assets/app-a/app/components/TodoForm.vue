<script setup lang="ts">
const props = defineProps<{
  editId: string | null
}>()

const createText = ref('')
const updateText = ref('')
</script>

<template>
  <section class="stack">
    <div class="stack">
      <h2>Create form</h2>
      <span class="meta-pill">{{ createText.trim() ? 'Valid' : 'Needs text' }}</span>
    </div>

    <label class="label">
      <span>Todo text</span>
      <input v-model="createText" placeholder="Draft the launch note">
    </label>

    <label class="label">
      <span>Assignee</span>
      <select>
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
      <button :disabled="!createText.trim()">
        Save
      </button>
    </div>

    <template v-if="props.editId">
      <div class="stack">
        <h2>Edit form</h2>
        <span class="meta-pill">{{ updateText ? 'Unsaved changes' : 'In sync' }}</span>
      </div>

      <label class="label">
        <span>Existing todo text</span>
        <input v-model="updateText" placeholder="Rename the task">
      </label>

      <div class="toolbar">
        <button class="secondary">
          Reset
        </button>

        <button :disabled="!updateText">
          Save changes
        </button>
      </div>
    </template>
  </section>
</template>
