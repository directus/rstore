import type { MultiplayerTextCursor } from '../types'
import type { RstoreMultiplayerChannel } from './useRstoreMultiplayerChannel'
import { nextTick, onUnmounted, watch } from 'vue'
import { rebaseMultiplayerTextCursor } from '../utils/multiplayerTextCursor'

type FormChangeTuple = [newValue: unknown, oldValue: unknown]
type FormChanges<TData extends Record<string, any>, TField extends keyof TData & string> = Partial<Record<TField, FormChangeTuple | undefined>>

export interface MultiplayerOpLogLike {
  undo: () => void
  redo: () => void
}

export interface MultiplayerRebaseFormLike<
  TData extends Record<string, any>,
  TField extends keyof TData & string = keyof TData & string,
> extends Record<string, any> {
  $rebase: (base: TData, changedFields?: TField[]) => void
  $onChange: (callback: (changes: FormChanges<TData, TField>) => void) => void | (() => void)
  $opLog: MultiplayerOpLogLike
}

export interface UseRstoreMultiplayerFormOptions<
  TData extends Record<string, any>,
  TField extends keyof TData & string = keyof TData & string,
> {
  form: MultiplayerRebaseFormLike<TData, TField> & TData
  channel: RstoreMultiplayerChannel<Partial<Pick<TData, TField>>, TField>
  getBaseValue: () => TData | null | undefined
  setBaseValue?: (value: TData, context: {
    update: Partial<Pick<TData, TField>>
    changedFields: TField[]
  }) => void
  trackedFields?: readonly TField[]
  getTextFieldElement?: (field: TField) => HTMLInputElement | HTMLTextAreaElement | null | undefined
}

export function useRstoreMultiplayerForm<
  TData extends Record<string, any>,
  TField extends keyof TData & string = keyof TData & string,
>(
  options: UseRstoreMultiplayerFormOptions<TData, TField>,
) {
  let suppressBroadcast = false

  const stopChange = options.form.$onChange((changes) => {
    if (suppressBroadcast) {
      return
    }

    const update = {} as Partial<Pick<TData, TField>>

    for (const [key, value] of Object.entries(changes) as [TField, FormChangeTuple | undefined][]) {
      if (value) {
        update[key] = value[0] as TData[TField]
      }
    }

    if (Object.keys(update).length > 0) {
      options.channel.sendUpdate(update)
    }
  })

  watch(options.channel.remoteUpdate, async (update) => {
    if (!update) {
      return
    }

    const currentValue = options.getBaseValue()
    if (!currentValue) {
      return
    }

    const nextBase = {
      ...currentValue,
      ...update,
    }
    const changedFields = Object.keys(update) as TField[]
    const previousValues = new Map<TField, TData[TField]>()
    const pendingSelectionRebases: Array<{
      cursor: MultiplayerTextCursor
      field: TField
      nextValue: string
      previousValue: string
      target: HTMLInputElement | HTMLTextAreaElement
    }> = []

    for (const field of changedFields) {
      previousValues.set(field, options.form[field])

      const previousValue = options.form[field]
      if (typeof previousValue !== 'string') {
        continue
      }

      const target = options.getTextFieldElement?.(field)
      if (!isFocusedTextField(target)) {
        continue
      }

      pendingSelectionRebases.push({
        field,
        target,
        previousValue,
        nextValue: previousValue,
        cursor: readTextCursor(target),
      })
    }

    options.setBaseValue?.(nextBase, {
      update,
      changedFields,
    })
    options.form.$rebase(nextBase, changedFields)

    for (const field of changedFields) {
      const previousValue = previousValues.get(field)
      const nextValue = options.form[field]

      if (typeof previousValue === 'string' && typeof nextValue === 'string') {
        options.channel.rebaseTextCursor(field, previousValue, nextValue)

        const pendingSelection = pendingSelectionRebases.find(item => item.field === field)
        if (pendingSelection) {
          pendingSelection.nextValue = nextValue
        }
      }
    }

    if (pendingSelectionRebases.length > 0) {
      await nextTick()

      for (const pendingSelection of pendingSelectionRebases) {
        if (!pendingSelection.target.isConnected || !isFocusedTextField(pendingSelection.target)) {
          continue
        }

        const rebasedCursor = rebaseMultiplayerTextCursor(
          pendingSelection.cursor,
          pendingSelection.previousValue,
          pendingSelection.nextValue,
        )

        pendingSelection.target.setSelectionRange(
          rebasedCursor.start,
          rebasedCursor.end,
          rebasedCursor.direction,
        )
      }
    }
  })

  function broadcastCurrentState() {
    const trackedFields = options.trackedFields
    if (!trackedFields?.length) {
      return
    }

    const update = {} as Partial<Pick<TData, TField>>
    for (const field of trackedFields) {
      update[field] = options.form[field]
    }
    options.channel.sendUpdate(update)
  }

  function withSuppressedBroadcast(action: () => void) {
    suppressBroadcast = true
    try {
      action()
    }
    finally {
      suppressBroadcast = false
    }
  }

  function undoAndSync() {
    withSuppressedBroadcast(() => {
      options.form.$opLog.undo()
    })
    broadcastCurrentState()
  }

  function redoAndSync() {
    withSuppressedBroadcast(() => {
      options.form.$opLog.redo()
    })
    broadcastCurrentState()
  }

  onUnmounted(() => {
    if (typeof stopChange === 'function') {
      stopChange()
    }
  })

  return {
    broadcastCurrentState,
    undoAndSync,
    redoAndSync,
  }
}

function isFocusedTextField(
  target: HTMLInputElement | HTMLTextAreaElement | null | undefined,
): target is HTMLInputElement | HTMLTextAreaElement {
  return !!target
    && typeof document !== 'undefined'
    && document.activeElement === target
}

function readTextCursor(target: HTMLInputElement | HTMLTextAreaElement): MultiplayerTextCursor {
  const start = target.selectionStart ?? 0
  const end = target.selectionEnd ?? start

  return {
    start,
    end,
    direction: normalizeSelectionDirection(target.selectionDirection),
  }
}

function normalizeSelectionDirection(direction: string | null): MultiplayerTextCursor['direction'] {
  if (direction === 'forward' || direction === 'backward') {
    return direction
  }

  return 'none'
}
