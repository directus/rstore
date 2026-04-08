<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  editId: string | null
}>()

const draftText = ref('')
const editText = ref('')
</script>

<template>
  <section class="stack">
    <div class="stack">
      <div class="panel-header">
        <div class="stack">
          <p class="section-label">New task</p>
          <h2>Draft before saving</h2>
        </div>

        <span class="meta-pill">{{ draftText.trim() ? 'Ready to save' : 'Needs text' }}</span>
      </div>

      <label class="label">
        <span>Task name</span>
        <input v-model="draftText" placeholder="Draft the welcome email">
      </label>

      <div class="toolbar">
        <button class="secondary">
          Save
        </button>
      </div>
    </div>

    <div class="stack">
      <div class="panel-header">
        <div class="stack">
          <p class="section-label">Existing task</p>
          <h2>Practice editing</h2>
        </div>

        <span class="meta-pill">{{ editText ? 'Unsaved changes' : 'In sync' }}</span>
      </div>

      <label class="label">
        <span>Task name</span>
        <input v-model="editText" placeholder="Rename the task">
      </label>

      <div class="toolbar">
        <button class="secondary">
          Reset
        </button>

        <button>
          Save changes
        </button>
      </div>
    </div>
  </section>
</template>
