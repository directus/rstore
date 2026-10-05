import * as protocol from '@rstore/multiplayer/protocol'
import * as server from '@rstore/multiplayer/server'
import { describe, expect, it } from 'vitest'
import * as moduleEntry from '../src/module'
import * as guards from '../src/runtime/server/guards'

describe('compatibility facades', () => {
  it('re-exports the protocol guards from @rstore/multiplayer/protocol', () => {
    for (const name of ['isMultiplayerId', 'isMultiplayerMessage', 'isMultiplayerTextCursor', 'isMultiplayerUser', 'parseMultiplayerMessage'] as const) {
      expect(guards[name]).toBe(protocol[name])
      expect(moduleEntry[name]).toBe(protocol[name])
    }
  })

  it('re-exports the room server building blocks from @rstore/multiplayer/server', () => {
    for (const name of ['Room', 'RoomRegistry', 'PeerIdentityStore', 'PeerRateLimiter', 'isOriginAllowed'] as const)
      expect(moduleEntry[name]).toBe(server[name])
  })
})
