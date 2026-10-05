import type { PresenceChannelOptions } from '@rstore/multiplayer/presence'
import { createPresenceChannel } from '@rstore/multiplayer/presence'

/** Fake text transport: records sent frames (parsed) and toggles its open state. */
export function createFakeTransport() {
  const sent: any[] = []
  let open = true
  return {
    sent,
    transport: {
      send: (text: string) => {
        sent.push(JSON.parse(text))
      },
      isOpen: () => open,
    },
    setOpen(value: boolean) {
      open = value
    },
    /** Frames of one type, in send order. */
    sentOfType(type: string) {
      return sent.filter(frame => frame.type === type)
    },
  }
}

/** Alice's channel in `room` over a fake transport, plus a way to inject frames. */
export function createAliceChannel(options: Partial<PresenceChannelOptions> = {}) {
  const fake = createFakeTransport()
  const channel = createPresenceChannel({
    roomId: 'room',
    clientId: 'c-alice',
    user: { id: 'alice', name: 'Alice', color: '#f00' },
    transport: fake.transport,
    ...options,
  })
  return {
    ...fake,
    channel,
    receive(frame: Record<string, unknown>) {
      channel.receive(JSON.stringify(frame))
    },
  }
}

/** Presence frame of another connection. */
export function presenceFrame(userId: string, clientId: string, extra: Record<string, unknown> = {}) {
  return {
    type: 'multiplayer:presence',
    roomId: 'room',
    clientId,
    user: { id: userId, name: userId, color: '#fff' },
    ...extra,
  }
}

/** Leave frame of another connection. */
export function leaveFrame(userId: string, clientId: string) {
  return { type: 'multiplayer:leave', roomId: 'room', userId, clientId }
}

/** Typing frame of another connection. */
export function typingFrame(userId: string, clientId: string, target: Record<string, unknown> | null) {
  return { type: 'multiplayer:typing', roomId: 'room', userId, clientId, target }
}
