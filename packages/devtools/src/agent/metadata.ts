import type { RpcFunctionAgentOptions } from 'devframe'
import type { ActionName, ReadMethod } from '../protocol'

const reads: Record<ReadMethod, string> = {
  'rstore:list-sessions': 'List explicitly connected browser, Node, and read-only SSR sessions. Disconnected sessions cannot service live reads.',
  'rstore:list-stores': 'List store identities and capabilities in one explicit session. Use returned generation in every target.',
  'rstore:get-collections': 'Inspect registered collection definitions and cache counts at exact store target; never fetch remote records.',
  'rstore:get-cache': 'Read bounded, paged cache previews at exact target and collection. Truncation and unavailable flags describe incomplete data.',
  'rstore:get-history': 'Read bounded detached history at exact target. Cursor pages preserve operation sequence; SSR reports recorded data.',
  'rstore:get-subscriptions': 'Inspect active subscription descriptions at exact target without invoking callbacks.',
  'rstore:get-modules': 'Inspect bounded module previews and callable metadata at exact target; never invoke module functions.',
  'rstore:get-plugins': 'Inspect registered plugin descriptions at exact target without executing plugin functions.',
}
const actions: Record<ActionName, string> = {
  'clear-history': 'Clear retained diagnostic history for exact live writable target.',
  'write-cache-item': 'Write plain JSON item through public cache API at exact target and collection. Accepted queued writes may complete later.',
  'delete-cache-item': 'Delete specified key through public cache API at exact target and collection. Accepted queued writes may complete later.',
  'clear-cache': 'Clear public cache at exact live writable target. Application-owned paused cache remains paused.',
  'create-item': 'Create plain JSON item through registered collection connector at exact target. Connector success is returned without durability guarantees.',
  'update-item': 'Update specified key through registered collection connector at exact target using plain JSON patch.',
  'delete-item': 'Delete specified key through registered collection connector at exact target.',
}
const destructive = new Set<ActionName>(['clear-history', 'delete-cache-item', 'clear-cache', 'delete-item'])

/** Public RPC metadata; private producer and module invocation IDs stay hidden. */
export function publicAgentMetadata(method: string): RpcFunctionAgentOptions | undefined {
  if (Object.hasOwn(reads, method))
    return { description: reads[method as ReadMethod], safety: 'read', tags: ['rstore', 'inspection'] }
  const action = method.replace(/^rstore:/, '') as ActionName
  if (!method.startsWith('rstore:') || !Object.hasOwn(actions, action))
    return undefined
  return {
    description: `${actions[action]} Requires complete target, commandId, issuedAt, and matching action. Read-only/SSR targets reject. Deduplication lasts five minutes within registration; never retry uncertain writes automatically.`,
    safety: destructive.has(action) ? 'destructive' : 'action',
    tags: ['rstore', 'mutation'],
  }
}
