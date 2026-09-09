import type { FormOperation, StandardSchemaV1 } from '@rstore/shared'
import type { FormObjectRuntime } from './context'
import { optimizeOpLog } from './opLog'
import { applyRuntimeOp, initRelationData, rebuildState, snapshotFormOperation, snapshotFormOperations } from './state'
import { recordUndoneRelationValue } from './undoSnapshots'

/**
 * Create the public op-log API bound to a runtime context.
 */
export function createOpLogApi<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
) {
  return {
    getAll: (): FormOperation<TData>[] => snapshotFormOperations(ctx),
    getOptimized: (): FormOperation<TData>[] => optimizeOpLog(snapshotFormOperations(ctx), ctx.options.collection),
    getFieldOps: (field: keyof TData): FormOperation<TData>[] => snapshotFormOperations(ctx).filter(op => op.field === field),
    getOpsBy: (filter: (operation: FormOperation<TData>) => boolean): FormOperation<TData>[] => snapshotFormOperations(ctx).filter(filter),
    getLastFieldOp: (field: keyof TData): FormOperation<TData> | undefined => {
      for (let i = ctx.opLog.length - 1; i >= 0; i--) {
        const op = ctx.opLog[i]
        if (op && op.field === field)
          return snapshotFormOperation(ctx, op)
      }
      return undefined
    },
    hasFieldChanged: (field: keyof TData): boolean => ctx.opLog.some(op => op.field === field),
    getOpsInRange: (startTime: number, endTime: number): FormOperation<TData>[] =>
      snapshotFormOperations(ctx).filter(op => op.timestamp >= startTime && op.timestamp <= endTime),
    clear: (): void => {
      ctx.opLog.length = 0
      ctx.redoStack.length = 0
      ctx.undoneOps = new WeakSet()
      ctx.form.$changedProps = {}
    },
    undo: (): boolean => {
      if (ctx.opLog.length === 0)
        return false
      const undoneOp = ctx.opLog.pop()!
      ctx.redoStack.push(undoneOp)
      ctx.undoneOps.add(undoneOp)
      rebuildState(ctx)
      // Recorded after the rebuild, so the remembered relation value is the one
      // the undo made visible.
      recordUndoneRelationValue(ctx, undoneOp)
      return true
    },
    redo: (): boolean => {
      if (ctx.redoStack.length === 0)
        return false
      const redoneOp = ctx.redoStack.pop()!
      ctx.opLog.push(redoneOp)
      ctx.undoneOps.delete(redoneOp)
      ctx.undoneRelationValues.delete(redoneOp)
      rebuildState(ctx)
      return true
    },
    get canUndo(): boolean {
      return ctx.opLog.length > 0
    },
    get canRedo(): boolean {
      return ctx.redoStack.length > 0
    },
    stateAt: (index: number): Partial<TData> => {
      const state: Record<string, any> = { ...(ctx.initialData as TData) }
      initRelationData(ctx, state, false)
      const count = Math.min(index, ctx.opLog.length)
      for (let i = 0; i < count; i++) {
        applyRuntimeOp(ctx, state, ctx.opLog[i]!, { attachRelationApi: false })
      }
      return state as Partial<TData>
    },
  }
}
