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
      <div class="panel-header">
        <div class="stack">
          <p class="section-label">New task</p>
          <h2>Draft before saving</h2>
        </div>

        <span class="meta-pill">{{ createText.trim() ? 'Ready to save' : 'Needs text' }}</span>
      </div>

      <label class="label">
        <span>Task name</span>
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
    </div>

    <template v-if="props.editId">
      <div class="stack">
        <div class="panel-header">
          <div class="stack">
            <p class="section-label">Existing task</p>
            <h2>Practice editing</h2>
          </div>

          <span class="meta-pill">{{ updateText ? 'Unsaved changes' : 'In sync' }}</span>
        </div>

        <label class="label">
          <span>Task name</span>
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
      </div>
    </template>
  </section>
</template>
