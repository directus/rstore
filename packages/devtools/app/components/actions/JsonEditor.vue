<script setup lang="ts">
/** JSON input remains user-entered text, projected previews are never copied here. */
defineProps<{ modelValue: string }>()
/** Preserve exact entered JSON after producer failures. */
defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <label class="json-editor">
    <span>JSON item</span>
    <textarea
      :value="modelValue" rows="9" spellcheck="false" aria-label="JSON item"
      @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
  </label>
</template>
