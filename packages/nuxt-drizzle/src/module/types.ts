import type { CreateOfflinePluginOptions } from '@rstore/offline'
import type { TableConfig } from 'drizzle-orm'
import type { getTableConfig as mysqlGetTableConfig } from 'drizzle-orm/mysql-core'
import type { getTableConfig as pgGetTableConfig } from 'drizzle-orm/pg-core'
import type { getTableConfig as singleStoreGetTableConfig } from 'drizzle-orm/singlestore-core'
import type { getTableConfig as sqliteGetTableConfig } from 'drizzle-orm/sqlite-core'

export interface ModuleOptions {
  /** Path to the drizzle config file. */
  drizzleConfigPath?: string
  /** Import name for the function that returns the drizzle instance. */
  drizzleImport?: {
    name: string
    from: string
  }
  /** Generated REST API path. */
  apiPath?: string
  /** Enable WebSocket support for real-time updates. */
  ws?: boolean | {
    /** Server-side route where the generated WebSocket handler is registered. */
    apiPath?: string
    /** URL the client uses to connect to the realtime WebSocket. */
    clientEndpoint?: string
    /** Heartbeat interval in milliseconds. */
    heartbeatInterval?: number
    /** Auto-reconnect configuration forwarded to `useWebSocket`. */
    autoReconnect?: boolean | {
      retries?: number
      delay?: number
    }
  }
  /** Enable offline support. */
  offline?: boolean | (CreateOfflinePluginOptions & {
    /** Used in the query to synchronize the collections. */
    serializeDateValue?: (date: Date) => any
  })
  /** Scope id under which the realtime plugin registers. */
  scopeId?: string
}

export type AllTableConfig = TableConfig & (
  ReturnType<typeof pgGetTableConfig>
  | ReturnType<typeof mysqlGetTableConfig>
  | ReturnType<typeof sqliteGetTableConfig>
  | ReturnType<typeof singleStoreGetTableConfig>
)

export type Column = AllTableConfig['columns'][number]

export interface RealtimeResolvedOptions {
  /** Server route for the realtime WebSocket handler. */
  wsApiPath: string
  /** Client endpoint for realtime connections. */
  wsClientEndpoint: string
  /** Heartbeat interval in milliseconds. */
  wsHeartbeatInterval: number
  /** Auto reconnect option passed to the client plugin. */
  wsAutoReconnect: ModuleOptions['ws'] extends object ? NonNullable<ModuleOptions['ws']>['autoReconnect'] : unknown
}
