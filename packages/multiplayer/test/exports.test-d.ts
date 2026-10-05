import type * as Root from '@rstore/multiplayer'
import type * as Clock from '@rstore/multiplayer/clock'
import type * as Lww from '@rstore/multiplayer/lww'
import type * as Protocol from '@rstore/multiplayer/protocol'
import type * as Text from '@rstore/multiplayer/text'
import type * as Shared from '@rstore/shared'
import { describe, expectTypeOf, it } from 'vitest'

describe('@rstore/multiplayer public types', () => {
  it('re-exports every subpath type from the root', () => {
    expectTypeOf<Root.HLCTimestamp>().toEqualTypeOf<Clock.HLCTimestamp>()
    expectTypeOf<Root.HLCString>().toEqualTypeOf<Clock.HLCString>()
    expectTypeOf<Root.HLCClockSkewInfo>().toEqualTypeOf<Clock.HLCClockSkewInfo>()
    expectTypeOf<Root.HybridLogicalClockOptions>().toEqualTypeOf<Clock.HybridLogicalClockOptions>()
    expectTypeOf<Root.Tombstone>().toEqualTypeOf<Lww.Tombstone>()
    expectTypeOf<Root.TombstoneStore>().toEqualTypeOf<Lww.TombstoneStore>()
    expectTypeOf<Root.ScheduleTombstoneGcOptions>().toEqualTypeOf<Lww.ScheduleTombstoneGcOptions>()
    expectTypeOf<Root.TombstoneGcSweepInfo>().toEqualTypeOf<Lww.TombstoneGcSweepInfo>()
    expectTypeOf<Root.MergeTextOptions>().toEqualTypeOf<Text.MergeTextOptions>()
    expectTypeOf<Root.TextRange>().toEqualTypeOf<Text.TextRange>()
    expectTypeOf<Root.TextPositionAffinity>().toEqualTypeOf<Text.TextPositionAffinity>()
    expectTypeOf<Root.RebaseTextRangeOptions>().toEqualTypeOf<Text.RebaseTextRangeOptions>()
    expectTypeOf<Root.ParseMultiplayerMessageOptions>().toEqualTypeOf<Protocol.ParseMultiplayerMessageOptions>()
  })

  it('keeps the definitions that still live in @rstore/shared (0.9)', () => {
    expectTypeOf<Clock.FieldTimestampValue>().toEqualTypeOf<Shared.FieldTimestampValue>()
    expectTypeOf<Lww.FieldTimestamps>().toEqualTypeOf<Shared.FieldTimestamps>()
    expectTypeOf<Lww.FieldConflict>().toEqualTypeOf<Shared.FieldConflict>()
    expectTypeOf<Lww.MergeResult>().toEqualTypeOf<Shared.MergeResult>()
    expectTypeOf<Text.TextChange>().toEqualTypeOf<Shared.TextChange>()
    expectTypeOf<Text.TextMergeConflict>().toEqualTypeOf<Shared.TextMergeConflict>()
    expectTypeOf<Text.TextMergeResult>().toEqualTypeOf<Shared.TextMergeResult>()
    expectTypeOf<Protocol.MultiplayerTextCursor>().toEqualTypeOf<Shared.MultiplayerTextCursor>()
    expectTypeOf<Protocol.MultiplayerUser>().toEqualTypeOf<Shared.MultiplayerUser>()
    expectTypeOf<Protocol.MultiplayerUpdateMessage>().toEqualTypeOf<Shared.MultiplayerUpdateMessage>()
    expectTypeOf<Protocol.MultiplayerPresenceMessage>().toEqualTypeOf<Shared.MultiplayerPresenceMessage>()
    expectTypeOf<Protocol.MultiplayerLeaveMessage>().toEqualTypeOf<Shared.MultiplayerLeaveMessage>()
    expectTypeOf<Protocol.MultiplayerTypingMessage>().toEqualTypeOf<Shared.MultiplayerTypingMessage>()
    expectTypeOf<Protocol.MultiplayerTypingTarget>().toEqualTypeOf<Shared.MultiplayerTypingTarget>()
    expectTypeOf<Protocol.MultiplayerMessage>().toEqualTypeOf<Shared.MultiplayerMessage>()
    expectTypeOf<Root.MultiplayerMessage>().toEqualTypeOf<Shared.MultiplayerMessage>()
  })
})
