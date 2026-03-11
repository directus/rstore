import type { RstoreMultiplayerChannel } from './useRstoreMultiplayerChannel'
import { onUnmounted, watch } from 'vue'

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

  watch(options.channel.remoteUpdate, (update) => {
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

    options.setBaseValue?.(nextBase, {
      update,
      changedFields,
    })
    options.form.$rebase(nextBase, changedFields)
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
