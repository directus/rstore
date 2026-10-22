import type { DevframeNodeContext, DevframeNodeRpcSession } from 'devframe'

/** Send detached metadata only to peers whose server-side auth handshake succeeded. */
export function broadcastInvalidation(context: DevframeNodeContext, event: unknown): void {
  void context.rpc.broadcast({
    method: 'rstore:invalidate' as never,
    args: [event] as never,
    optional: true,
    event: true,
    // Pinned Devframe attaches server-owned metadata to each birpc peer; the
    // broadcast callback's public type does not expose that extra property.
    filter: client => (client as typeof client & { $meta?: DevframeNodeRpcSession['meta'] }).$meta?.isTrusted === true,
  }).catch(() => {})
}
