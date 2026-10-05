import type { MaybeRefOrGetter } from 'vue'
import type { RstoreMultiplayerChannel } from './useRstoreMultiplayerChannel'
import { toValue } from 'vue'
import { readTextCursor } from '../utils/selection'
import { useRstoreMultiplayerField } from './useRstoreMultiplayerField'

export interface UseRstoreMultiplayerTextFieldOptions<TField extends string> {
  field: MaybeRefOrGetter<TField>
  channel: RstoreMultiplayerChannel<any, TField>
}

export function useRstoreMultiplayerTextField<TField extends string>(
  options: UseRstoreMultiplayerTextFieldOptions<TField>,
) {
  const field = useRstoreMultiplayerField(options)

  function onFocus(event: FocusEvent) {
    field.onFocus()
    updateCursor(event)
  }

  function onCursorEvent(event: Event) {
    updateCursor(event)
  }

  function updateCursor(event: Event) {
    const target = event.target
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
      return
    }

    options.channel.setTextCursor(toValue(options.field), readTextCursor(target))
  }

  return {
    onFocus,
    onBlur: field.onBlur,
    onCursorEvent,
  }
}
