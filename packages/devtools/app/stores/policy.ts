import type { SessionSummary, StoreSummary } from '../../src/protocol'
import type { ConnectionStatus } from '../transport/types'

/** Explain action unavailability using producer capability and current viewer ownership. */
export function actionDisabled(status: ConnectionStatus, store: StoreSummary | undefined, session: SessionSummary | undefined, pending: boolean): string {
  if (status !== 'live')
    return 'Disconnected'
  if (!store)
    return 'Select store'
  if (session?.kind === 'ssr' || session?.completed)
    return 'Recorded snapshot'
  if (session && !session.connected)
    return 'Producer disconnected'
  if (store.capabilities.readOnly)
    return 'Read-only'
  if (pending)
    return 'Command pending'
  return ''
}
