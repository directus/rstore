<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { registerTutorialAction } from '../tutorial/bridge'
import { reportFormState } from '../tutorial/reporting'

defineProps<{
  editId: string | null
}>()

const draftText = ref('')
const editText = ref('')

registerTutorialAction('form-smoke', async () => {
  draftText.value = 'Practice createForm'
  editText.value = 'Updated from updateForm'

  reportFormState({
    ready: false,
    valid: draftText.value.trim().length > 0,
    hasChanges: editText.value.trim().length > 0,
    created: false,
    updated: false,
    resetWorked: false,
  })
})

watchEffect(() => {
  reportFormState({
    ready: false,
    valid: draftText.value.trim().length > 0,
    hasChanges: editText.value.trim().length > 0,
  })
})
</script>

<template>
  <section>
    <h2>Create form</h2>

    <label class="label">
      <span>Todo text</span>
      <input v-model="draftText" placeholder="Use createForm() here">
    </label>

    <div class="toolbar">
      <button class="secondary">
        Save
      </button>
    </div>

    <h2>Edit form</h2>

    <label class="label">
      <span>Existing todo text</span>
      <input v-model="editText" placeholder="Use updateForm() here">
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
