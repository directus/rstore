import type { DevframeNodeContext } from 'devframe'
import type { RpcFunctionDefinitionAny } from 'devframe/rpc'
import { toAgentToolName } from 'devframe/utils/agent-tool-name'
import * as v from 'valibot'
import { ACTION_METHODS, ActionSchema, READ_METHODS, ReadSchemas } from '../protocol'
import { publicAgentMetadata } from './metadata'

/** Complete agent allow-list; internal producer functions have no catalog entry. */
export const PUBLIC_METHODS = [...READ_METHODS, ...ACTION_METHODS] as const
/** Method identifier exposed through public tools. */
export type PublicMethod = typeof PUBLIC_METHODS[number]
/** Official Devframe normalization maps colon IDs to MCP-compatible names. */
export const MCP_TOOL_NAMES = Object.fromEntries(PUBLIC_METHODS.map(method => [method, toAgentToolName(method)])) as Record<PublicMethod, string>

/** Shared Valibot source validates full envelope and matching RPC/action identity. */
export function publicMethodSchema(method: PublicMethod) {
  if (Object.hasOwn(ReadSchemas, method))
    return ReadSchemas[method as keyof typeof ReadSchemas]
  return v.pipe(ActionSchema, v.check(input => `rstore:${input.action}` === method, 'Action does not match RPC method'))
}

/** Build uncached public handlers for relay or stdio forwarding; use shared schemas. */
export function publicRpcDefinitions(dispatch: (method: PublicMethod, input: unknown, context: DevframeNodeContext) => unknown): RpcFunctionDefinitionAny[] {
  return PUBLIC_METHODS.map(method => ({
    name: method,
    type: READ_METHODS.includes(method as typeof READ_METHODS[number]) ? 'query' : 'action',
    cacheable: false,
    jsonSerializable: true,
    args: [publicMethodSchema(method)] as const,
    agent: publicAgentMetadata(method),
    setup: (context: DevframeNodeContext) => ({ handler: (input: unknown) => dispatch(method, input, context) }),
  }))
}
