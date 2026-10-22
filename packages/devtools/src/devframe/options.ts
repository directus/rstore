import type { DevframeDefinition, DevframeNodeRpcSessionMeta, DevframeRpcConnection } from 'devframe'
import type { DevframeAuthHandler } from 'devframe/node/auth'
import type { RstoreDevtools } from '../runtime/types'

/** Server-issued role; client labels never confer authority. */
export type ProducerRole = 'viewer' | 'browser' | 'node' | 'ssr'
/** Credentials deliberately absent from discovery metadata. */
export interface RoleTokens {
  /** Interactive viewing and development actions. */
  viewer?: string[]
  /** Same-origin development page producer credentials. */
  browser?: string[]
  /** Explicit process producer credentials. */
  node?: string[]
  /** Private Nitro-only request capture credentials. */
  ssr?: string[]
}
/** Definition configuration, independent from HTTP mounting. */
export interface RstoreDevframeOptions {
  /** Optional caller-owned in-process producer. */
  runtime?: RstoreDevtools
  /** Server-owned role credentials; tokens must be distinct. */
  authTokens?: RoleTokens
  /** Hosted path override, default /__rstore/. */
  basePath?: string
  /** Override packaged client directory for workspace development. */
  clientDir?: string
}
/** Required server hooks bundled with portable definition. */
export interface RelayHooks {
  /** Devframe interactive gate with private role checks. */
  auth: DevframeAuthHandler
  /** Remove only disconnected owner's current registrations. */
  onPeerDisconnect: (connection: DevframeRpcConnection, meta: DevframeNodeRpcSessionMeta) => void
  /** Release retained metadata and producer ownership. */
  dispose: () => void
  /** Enforce separate HTTP MCP bearer authority before mounting. */
  rejectCredential: (token: string) => void
}
/** Host wrapper consumes hooks so omission cannot silently weaken access. */
export type RstoreDevframeDefinition = DevframeDefinition & { relay: RelayHooks }
