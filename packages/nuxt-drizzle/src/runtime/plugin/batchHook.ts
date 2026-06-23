import type { BatchWireOperation, BatchWireResponse } from '../utils/batch'
import type { DrizzlePluginContext } from './context'
import SuperJSON from 'superjson'
import { clientIdHeaders } from './context'
import { stripPrimaryKeys } from './mutationHooks'

/** Register the unified batch hook. */
export function installBatchHook(ctx: DrizzlePluginContext, hook: any) {
  hook('batch', async (payload: any) => {
    const { wireOps, opRefs } = collectBatchOperations(payload.operations)
    if (wireOps.length === 0) {
      return
    }

    let response: BatchWireResponse
    try {
      const raw = await ctx.requestFetch<string>(`${ctx.apiPath}/_batch`, {
        method: 'POST',
        body: SuperJSON.stringify({ operations: wireOps }),
        responseType: 'text',
        headers: clientIdHeaders(),
      })
      response = SuperJSON.parse(raw) as BatchWireResponse
    }
    catch (error) {
      for (const op of opRefs) {
        op.setError(error as Error)
      }
      return
    }

    response.results.forEach((entry, i) => {
      const op = opRefs[i]
      if (!op) {
        return
      }
      if (entry.ok) {
        op.setResult(op.type === 'delete' ? undefined : entry.result ?? undefined)
      }
      else {
        op.setError(new Error(entry.error))
      }
    })
  })
}

function collectBatchOperations(operations: any[]) {
  const wireOps: BatchWireOperation[] = []
  const opRefs: any[] = []
  for (const op of operations) {
    const wireOp = toWireOperation(op)
    if (wireOp) {
      wireOps.push(wireOp)
      opRefs.push(op)
    }
  }
  return { wireOps, opRefs }
}

function toWireOperation(op: any): BatchWireOperation | undefined {
  if (op.type === 'fetchFirst') {
    if (op.key == null) {
      return
    }
    return {
      type: 'fetchFirst',
      collection: op.collection.name,
      key: String(op.key),
      searchQuery: {
        ...op.findOptions?.params,
        include: op.findOptions?.include,
      },
    }
  }
  if (op.type === 'create') {
    return {
      type: 'create',
      collection: op.collection.name,
      item: op.item as Record<string, any>,
    }
  }
  if (op.type === 'update') {
    return {
      type: 'update',
      collection: op.collection.name,
      key: String(op.key),
      item: stripPrimaryKeys(op.collection, op.item as Record<string, any>),
    }
  }
  if (op.type === 'delete') {
    return {
      type: 'delete',
      collection: op.collection.name,
      key: String(op.key),
    }
  }
}
