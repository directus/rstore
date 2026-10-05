/**
 * Version of the `collab:*` frames. A client lists the versions it speaks in
 * `collab:hello.protocols`; the server answers with the highest common one
 * in `collab:welcome.protocol`, or rejects with reason `protocol`. Bump it
 * when a frame or an op changes meaning, and keep the previous version in
 * `SUPPORTED_COLLAB_PROTOCOLS` until clients have upgraded.
 */
export const COLLAB_PROTOCOL_VERSION = 2

/**
 * Versions this build of the sequencer accepts. Version 2 adds channels:
 * after the welcome, frames carry the `ch` of the hello instead of the
 * document and client ids, and `collab:ops` names authors by number.
 */
export const SUPPORTED_COLLAB_PROTOCOLS: readonly number[] = [1, 2]

/**
 * Highest version both sides speak, or `null`. Clients that send no list
 * are assumed to speak version 1.
 */
export function negotiateCollabProtocol(clientVersions: readonly number[] | undefined, supported: readonly number[] = SUPPORTED_COLLAB_PROTOCOLS): number | null {
  let best: number | null = null
  for (const version of clientVersions ?? [1]) {
    if (supported.includes(version) && (best === null || version > best)) {
      best = version
    }
  }
  return best
}
