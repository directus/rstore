import type { MaybeRefOrGetter } from 'vue'
import type { RstoreMultiplayerChannel } from './useRstoreMultiplayerChannel'
import { onUnmounted, ref, toValue } from 'vue'

export interface UseRstoreMultiplayerFieldOptions<TField extends string> {
  field: MaybeRefOrGetter<TField>
  channel: RstoreMultiplayerChannel<any, TField>
}

export function useRstoreMultiplayerField<TField extends string>(
  options: UseRstoreMultiplayerFieldOptions<TField>,
) {
  let pendingBlurTimer: ReturnType<typeof setTimeout> | null = null
  const activeField = ref<TField | null>(null)

  function clearPendingBlur() {
    if (pendingBlurTimer != null) {
      clearTimeout(pendingBlurTimer)
      pendingBlurTimer = null
    }
  }

  function onFocus() {
    clearPendingBlur()
    const field = toValue(options.field)
    activeField.value = field
    options.channel.setFocusedField(field)
  }

  function onBlur() {
    const field = toValue(options.field)
    clearPendingBlur()
    pendingBlurTimer = setTimeout(() => {
      pendingBlurTimer = null

      if (activeField.value !== field) {
        return
      }

      if (typeof document !== 'undefined' && !document.hasFocus()) {
        return
      }

      activeField.value = null
      options.channel.clearFocus()
    }, 0)
  }

  onUnmounted(() => {
    clearPendingBlur()
  })

  return {
    onFocus,
    onBlur,
  }
}
