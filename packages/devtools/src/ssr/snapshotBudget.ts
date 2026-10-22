import type { SSRSnapshot } from './types'
import { DevtoolsError } from '../protocol'

/** Fixed envelope reserve leaves the remaining 384 KiB for projected sections. */
const METADATA_BYTES = 128 * 1024
/** Encoded capture limit, including metadata and detached section wrappers. */
export const SSR_SNAPSHOT_BYTES = 512 * 1024
/** Display labels have no authority and may be abbreviated independently of IDs. */
const LABEL_CHARACTERS = 1024

/** Measure only detached metadata and section DTOs. */
export function encodedSSRBytes(snapshot: unknown): number {
  return new TextEncoder().encode(JSON.stringify(snapshot)).length
}

/** Bound display metadata before traversal without rewriting any authority identity. */
export function boundSSRMetadata(snapshot: SSRSnapshot): void {
  for (const summary of [snapshot.session, ...snapshot.session.stores]) {
    if (summary.label.length > LABEL_CHARACTERS) {
      summary.label = summary.label.slice(0, LABEL_CHARACTERS)
      snapshot.truncated = true
    }
  }
  // Never advertise targets whose wrappers could not be reserved for capture.
  while (encodedSSRBytes(snapshot) > METADATA_BYTES && snapshot.session.stores.length > 1) {
    snapshot.session.stores.pop()
    snapshot.additionalStores?.pop()
    snapshot.truncated = true
  }
  if (encodedSSRBytes(snapshot) > METADATA_BYTES)
    throw new DevtoolsError({ code: 'CAPACITY', message: 'SSR identity exceeds metadata byte budget' })
}

/** Final hard gate also covers captures with no registered stores. */
export function detachSSRSnapshot(snapshot: SSRSnapshot): SSRSnapshot {
  if (encodedSSRBytes(snapshot) > SSR_SNAPSHOT_BYTES)
    throw new DevtoolsError({ code: 'CAPACITY', message: 'SSR snapshot exceeds byte budget' })
  return JSON.parse(JSON.stringify(snapshot))
}
