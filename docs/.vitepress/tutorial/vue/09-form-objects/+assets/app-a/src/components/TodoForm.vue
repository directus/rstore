<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  editId: string | null
}>()

const draftText = ref('')
const editText = ref('')
</script>

<template>
  <section>
    <h2>Create form</h2>

    <label class="label">
      <span>Todo text</span>
      <input v-model="draftText" placeholder="Draft the welcome email">
    </label>

    <div class="toolbar">
      <button class="secondary">
        Save
      </button>
    </div>

    <h2>Edit form</h2>

    <label class="label">
      <span>Existing todo text</span>
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
  </section>
</template>
