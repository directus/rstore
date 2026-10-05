import type { DocNodeRecord } from '@rstore/multiplayer/ot'
import type { OpLogEntry } from '@rstore/multiplayer/server'

/** Tables used by the Drizzle collab op-log store. */
export interface DrizzleOpLogTables {
  nodes: any
  ops: any
  docs: any
}

/** Transaction-local append data shared with guards, mappings and persistence. */
export interface DrizzleOpLogAppendContext {
  tx: any
  docId: string
  entry: OpLogEntry
  nodes: DocNodeRecord[]
  /** Authenticated application context. It is never persisted or sent on the wire. */
  appendContext?: unknown
}

/** Canonical columns used to read and scope each mapped table. */
export interface DrizzleOpLogColumns {
  nodes: Record<'id' | 'docId' | 'parentId' | 'orderKey' | 'type' | 'attrs' | 'content' | 'deleted' | 'version', any>
  ops: Record<'docId' | 'version' | 'clientId' | 'seq' | 'userId' | 'ops' | 'time', any>
  docs: Record<'docId' | 'head' | 'floor', any>
}

/** Maps canonical collab rows to application-specific Drizzle table values. */
export interface DrizzleOpLogMapping {
  columns: DrizzleOpLogColumns
  nodeValues: (context: DrizzleOpLogAppendContext, node: DocNodeRecord) => Record<string, unknown>
  operationValues: (context: DrizzleOpLogAppendContext) => Record<string, unknown>
  documentValues: (docId: string, values: Partial<{ head: number, floor: number }>, context?: DrizzleOpLogAppendContext) => Record<string, unknown>
  compactedOperationValues: () => Record<string, unknown>
}

/** Default mapping for tables that expose the documented canonical property names. */
export function createDefaultDrizzleOpLogMapping(tables: DrizzleOpLogTables): DrizzleOpLogMapping {
  const { nodes, ops, docs } = tables
  return {
    columns: {
      nodes: { id: nodes.id, docId: nodes.docId, parentId: nodes.parentId, orderKey: nodes.orderKey, type: nodes.type, attrs: nodes.attrs, content: nodes.content, deleted: nodes.deleted, version: nodes.version },
      ops: { docId: ops.docId, version: ops.version, clientId: ops.clientId, seq: ops.seq, userId: ops.userId, ops: ops.ops, time: ops.time },
      docs: { docId: docs.docId, head: docs.head, floor: docs.floor },
    },
    nodeValues: (_context, node) => ({ ...node }),
    operationValues: ({ docId, entry }) => ({ docId, version: entry.version, clientId: entry.clientId, seq: entry.seq, userId: entry.userId ?? null, ops: entry.ops, time: entry.time }),
    documentValues: (docId, values) => ({ docId, ...values }),
    compactedOperationValues: () => ({ ops: [] }),
  }
}
