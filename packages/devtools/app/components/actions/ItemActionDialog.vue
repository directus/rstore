<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useInspector } from '../../stores/connection'
import { errorMessage } from '../../stores/requests'
import { sameTarget } from '../../stores/selection'
import JsonEditor from './JsonEditor.vue'
/** Shared target-bound editor, invalidated centrally on target changes. */
const { state } = useInspector()
/** Accessible native dialog with browser-managed modal focus. */
const dialog = ref<HTMLDialogElement | null>(null)
/** Exact validation failure from authoritative action schema. */
const submitError = ref('')
/** Explicit typed address for collection actions opened without a selected cache row. */
const keyType = ref<'string' | 'number'>('string')
/** Raw user-entered address, never inferred from projected item metadata. */
const keyText = ref('')
/** Key field shown only when collection action starts without an address. */
const enterKey = ref(false)
/** Actions requiring explicit JSON item input. */
const needsItem = computed(() => state.draft && ['create-item', 'update-item', 'write-cache-item'].includes(state.draft.action))
/** Destructive confirmation includes captured collection/key/target. */
const destructive = computed(() => state.draft && ['delete-item', 'delete-cache-item', 'clear-cache', 'clear-history'].includes(state.draft.action))
/** Earlier uncertain commands remain a duplication risk after returning to this target. */
const uncertain = computed(() => state.outcomes.some(record => record.status === 'unknown' && sameTarget(record.command.target, state.selection.target)))
/** Derived validation never dispatches or creates an operation. */
const validation = computed(() => {
  if (!state.draft)
    return ''
  try {
    state.draft.command(state.selection, 'validation', Date.now())
    return ''
  }
  catch (error) { return errorMessage(error) }
})
watch(() => state.draft, (draft) => {
  submitError.value = ''
  enterKey.value = !!draft && ['update-item', 'delete-item'].includes(draft.action) && draft.key === undefined
  keyType.value = 'string'
  keyText.value = ''
  if (draft && enterKey.value)
    draft.key = ''
  if (draft && !dialog.value?.open)
    dialog.value?.showModal()
  if (!draft && dialog.value?.open)
    dialog.value.close()
}, { flush: 'post' })
/** Preserve caller-selected numeric/string key type, rejecting non-finite numeric text. */
function updateKey(): void {
  if (!state.draft)
    return
  state.draft.key = keyType.value === 'number' ? (keyText.value.trim() ? Number(keyText.value) : Number.NaN) : keyText.value
}
/** Submit only schema-valid captured target and keep entered text on failure. */
async function submit(): Promise<void> {
  submitError.value = ''
  try {
    await state.submit()
  }
  catch (error) { submitError.value = errorMessage(error) }
}
/** Cancel only dialog ownership, leaving any dispatched command tracked. */
function close(): void {
  state.draft = null
}
</script>

<template>
  <dialog ref="dialog" class="action-dialog" @cancel="close" @close="close">
    <form v-if="state.draft" @submit.prevent="submit">
      <h2>{{ state.draft.action }}</h2>
      <p class="action-address">
        {{ state.draft.owner.target?.storeId }}<span v-if="state.draft.collection"> / {{ state.draft.collection }}</span>
        <code v-if="state.draft.key !== undefined">{{ typeof state.draft.key }}: {{ JSON.stringify(state.draft.key) }}</code>
      </p>
      <label v-if="enterKey">Item key
        <select v-model="keyType" aria-label="Key type" @change="updateKey"><option value="string">String</option><option value="number">Number</option></select>
        <input v-model="keyText" aria-label="Item key" @input="updateKey">
      </label>
      <JsonEditor v-if="needsItem" v-model="state.draft.text" />
      <label v-if="destructive" class="confirm-action">
        <input v-model="state.draft.confirmed" type="checkbox"> Confirm {{ state.draft.action }}
      </label>
      <p v-if="validation && validation !== 'Confirm action'" class="form-error">
        {{ validation }}
      </p>
      <p v-if="submitError" class="form-error">
        {{ submitError }}
      </p>
      <p v-if="state.outcome?.error" class="form-error">
        {{ state.outcome.error }}
      </p>
      <p v-if="uncertain" class="form-error">
        Outcome unknown. New submission may repeat effect.
      </p>
      <div class="dialog-buttons">
        <button type="button" @click="close">
          Cancel
        </button>
        <button type="submit" :disabled="!!validation || !!state.actionDisabled || state.outcome?.status === 'pending'">
          {{ state.outcome?.status === 'pending' ? 'Pending' : uncertain ? 'Submit new command' : 'Submit' }}
        </button>
      </div>
    </form>
  </dialog>
</template>
