import type { MaybeRefOrGetter } from 'vue'
import type { RstoreMultiplayerChannel } from './useRstoreMultiplayerChannel'
import { onUnmounted, ref, toValue } from 'vue'

export interface UseRstoreMultiplayerFieldOptions<TField extends string> {
  field: MaybeRefOrGetter<TField>
  channel: RstoreMultiplayerChannel<any, TField>
}

/** Only the latest focused field hook owns a shared channel's delayed blur. */
const focusedOwners = new WeakMap<RstoreMultiplayerChannel<any, any>, symbol>()

/** Share native focus transitions without letting an old hook blur the current field. */
export function useRstoreMultiplayerField<TField extends string>(
  options: UseRstoreMultiplayerFieldOptions<TField>,
) {
  let pendingBlurTimer: ReturnType<typeof setTimeout> | null = null
  const activeField = ref<TField | null>(null)
  const owner = Symbol('multiplayer-field')

  /** Cancel delayed blur before a newer focus transition or disposal. */
  function clearPendingBlur() {
    if (pendingBlurTimer != null) {
      clearTimeout(pendingBlurTimer)
      pendingBlurTimer = null
    }
  }

  /** Claim shared-channel focus for this hook's current field. */
  function onFocus() {
    clearPendingBlur()
    const field = toValue(options.field)
    activeField.value = field
    focusedOwners.set(options.channel, owner)
    options.channel.setFocusedField(field)
  }

  /** Clear only this hook's still-current focus after native blur settles. */
  function onBlur() {
    const field = toValue(options.field)
    clearPendingBlur()
    pendingBlurTimer = setTimeout(() => {
      pendingBlurTimer = null

      if (activeField.value !== field || focusedOwners.get(options.channel) !== owner) {
        return
      }

      activeField.value = null
      focusedOwners.delete(options.channel)
      options.channel.clearFocus()
    }, 0)
  }

  onUnmounted(() => {
    clearPendingBlur()
    if (focusedOwners.get(options.channel) === owner)
      focusedOwners.delete(options.channel)
  })

  return {
    onFocus,
    onBlur,
  }
}
