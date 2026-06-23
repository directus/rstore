import type { Config as DrizzleKitConfig } from 'drizzle-kit'
import type { OfflineResolvedOptions } from './offline'
import type { RealtimeResolvedOptions } from './types'
import { addTemplate } from '@nuxt/kit'

/** Register the generated runtime config consumed by client/server plugins. */
export function registerRuntimeConfigTemplate({
  apiPath,
  realtime,
  scopeId,
  drizzleConfig,
  offlineOptions,
}: {
  apiPath: string
  realtime: RealtimeResolvedOptions
  scopeId: string
  drizzleConfig: DrizzleKitConfig
  offlineOptions: OfflineResolvedOptions
}) {
  addTemplate({
    filename: '$rstore-drizzle-config.js',
    getContents: () => `export const apiPath = ${JSON.stringify(apiPath)}
export const wsApiPath = ${JSON.stringify(realtime.wsApiPath)}
export const wsClientEndpoint = ${JSON.stringify(realtime.wsClientEndpoint)}
export const wsHeartbeatInterval = ${JSON.stringify(realtime.wsHeartbeatInterval)}
export const wsAutoReconnect = ${JSON.stringify(realtime.wsAutoReconnect)}
export const scopeId = ${JSON.stringify(scopeId)}
export const dialect = '${drizzleConfig.dialect}'
export const syncSerializeDateValue = ${offlineOptions && 'serializeDateValue' in offlineOptions && offlineOptions.serializeDateValue ? offlineOptions.serializeDateValue.toString() : 'undefined'}\n`,
  })
}
