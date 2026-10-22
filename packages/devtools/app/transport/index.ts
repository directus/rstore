import type { ReadReply, SessionSummary } from '../../src/protocol'
import type { InspectorTransport } from './types'
import { connectBrowserPanel } from '../../src/browser/panel'
import { withDeadline } from '../stores/requests'

export { connectRelay } from './relay'

/** Try explicit parent endpoint, never consult legacy application globals. */
export async function connectEmbedded(): Promise<InspectorTransport> {
  if (window.parent === window)
    throw new Error('No embedded producer')
  const panel = connectBrowserPanel()
  try {
    await withDeadline(panel.whenConnected(2500), 2500)
  }
  catch (error) {
    panel.dispose()
    throw error
  }
  return {
    listSessions: async () => await panel.read({ method: 'rstore:list-sessions' }) as SessionSummary[],
    read: async (view, target, parameters = {}) => await panel.read({
      method: `rstore:get-${view}`,
      target,
      ...parameters,
    } as Parameters<typeof panel.read>[0]) as ReadReply,
    action: action => panel.execute(action),
    subscribe: listener => panel.subscribe(listener),
    onStatus: listener => panel.channel.events.on('status:updated', status => listener(status === 'connected'
      ? 'live'
      : status === 'connecting' ? 'connecting' : 'disconnected')),
    watch: (target, view) => panel.watch(target, view),
    dispose: () => panel.dispose(),
  }
}
