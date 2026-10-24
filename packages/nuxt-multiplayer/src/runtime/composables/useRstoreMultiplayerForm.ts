import type { MultiplayerTextCursor } from '../types'
import type { RstoreMultiplayerChannel } from './useRstoreMultiplayerChannel'
import { isPublicKey } from '@rstore/shared'
import { tryOnScopeDispose } from '@vueuse/core'
import { nextTick, watch } from 'vue'
import { rebaseMultiplayerTextCursor } from '../utils/multiplayerTextCursor'
import { sanitizeMultiplayerUpdate } from '../utils/sanitizeUpdate'

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
  /** Accepts function disposers and rstore's VueUse EventHook subscription. */
  $onChange: (callback: (changes: FormChanges<TData, TField>) => void) => void | (() => void) | { off: () => void }
  $opLog: MultiplayerOpLogLike
}

export interface UseRstoreMultiplayerFormOptions<
  TData extends Record<string, any>,
  TField extends keyof TData & string = keyof TData & string,
> {
  /** Real rstore forms allow unset fields before defaults or remote data arrive. */
  form: MultiplayerRebaseFormLike<TData, TField> & Partial<TData>
  channel: RstoreMultiplayerChannel<Partial<Pick<TData, TField>>, TField>
  getBaseValue: () => TData | null | undefined
  setBaseValue?: (value: TData, context: {
    update: Partial<Pick<TData, TField>>
    changedFields: TField[]
  }) => void
  trackedFields?: readonly TField[]
  getTextFieldElement?: (field: TField) => HTMLInputElement | HTMLTextAreaElement | null | undefined
}

/** Synchronize real form changes, remote rebases and history within its component lifetime. */
export function useRstoreMultiplayerForm<
  TData extends Record<string, any>,
  TField extends keyof TData & string = keyof TData & string,
>(
  options: UseRstoreMultiplayerFormOptions<TData, TField>,
) {
  let suppressedBroadcasts = 0
  let disposed = false

  const stopChange = options.form.$onChange((changes) => {
    if (suppressedBroadcasts > 0) {
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

  watch(options.channel.remoteUpdate, async (rawUpdate) => {
    if (!rawUpdate) {
      return
    }

    // Remote peers are untrusted: strip prototype-polluting keys and, when
    // a tracked-field list is configured, drop any field outside it so a
    // room member cannot overwrite arbitrary form/cache properties.
    const update = sanitizeMultiplayerUpdate(rawUpdate, options.trackedFields)
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
    const previousValues = new Map<TField, TData[TField] | undefined>()
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
    // Rebasing rebuilds pending local operations and queues their notification.
    // Keep that notification local instead of echoing it back to other peers.
    await withSuppressedBroadcast(() => options.form.$rebase(nextBase, changedFields))
    if (disposed)
      return

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
      if (disposed)
        return

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

  /** Publish explicit tracked fields or every public form field when no allowlist is configured. */
  function broadcastCurrentState() {
    if (disposed)
      return
    const trackedFields = options.trackedFields ?? Object.keys(options.form).filter(isPublicKey) as TField[]
    if (!trackedFields.length) {
      return
    }

    const update = {} as Partial<Pick<TData, TField>>
    for (const field of trackedFields) {
      update[field] = options.form[field]
    }
    const safeUpdate = sanitizeMultiplayerUpdate(update)
    if (safeUpdate)
      options.channel.sendUpdate(safeUpdate)
  }

  /** Keep suppression through rstore's queued change notification, including overlapping actions. */
  async function withSuppressedBroadcast(action: () => void) {
    suppressedBroadcasts++
    try {
      action()
      await nextTick()
    }
    finally {
      suppressedBroadcasts--
    }
  }

  /** Publish one complete tracked state after undo's queued notification settles. */
  async function undoAndSync() {
    await withSuppressedBroadcast(() => {
      options.form.$opLog.undo()
    })
    broadcastCurrentState()
  }

  /** Publish one complete tracked state after redo's queued notification settles. */
  async function redoAndSync() {
    await withSuppressedBroadcast(() => {
      options.form.$opLog.redo()
    })
    broadcastCurrentState()
  }

  // Scope disposal also releases hooks created outside a component.
  tryOnScopeDispose(() => {
    disposed = true
    if (typeof stopChange === 'function') {
      stopChange()
    }
    else {
      stopChange?.off()
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
