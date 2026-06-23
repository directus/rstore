import type { PeerState } from './peerState'
import {
  RSTORE_DRIZZLE_PROTOCOL_MAX_VERSION,
  RSTORE_DRIZZLE_PROTOCOL_MIN_VERSION,
  RSTORE_DRIZZLE_PROTOCOL_VERSION,
} from '../../../utils/realtime'

/** Header carrying the browser tab client id during HTTP upgrade. */
export const CLIENT_ID_HEADER = 'x-rstore-client-id'

/** Whether a peer-announced protocol version is supported. */
export function isSupportedClientVersion(v: unknown): boolean {
  if (v == null) {
    return true
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return false
  }
  return v >= RSTORE_DRIZZLE_PROTOCOL_MIN_VERSION && v <= RSTORE_DRIZZLE_PROTOCOL_MAX_VERSION
}

/** Send an init failure frame and close the peer. */
export function rejectPeerVersion(peer: any, state: PeerState, error: string) {
  state.rejected = true
  try {
    peer.send({ init: { ok: false, error, v: RSTORE_DRIZZLE_PROTOCOL_VERSION } })
  }
  catch (sendErr) {
    console.error('[ws] failed to send init rejection', sendErr)
  }
  try {
    peer.close?.(1002, error)
  }
  catch (closeErr) {
    console.error('[ws] failed to close after init rejection', closeErr)
  }
}

/** Send the init acknowledgement once. */
export function sendInitAck(peer: any, state: PeerState) {
  if (state.initAckSent) {
    return
  }
  state.initAckSent = true
  try {
    peer.send({ init: { ok: true, v: RSTORE_DRIZZLE_PROTOCOL_VERSION } })
  }
  catch (error) {
    console.error('[ws] failed to send init ack', error)
  }
}
