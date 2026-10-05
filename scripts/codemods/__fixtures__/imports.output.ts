import type { StoreSchema, } from '@rstore/shared'
import type { FieldTimestamps } from '@rstore/multiplayer'
import type { MultiplayerMessage } from '@rstore/multiplayer'
import type { HLCString } from '@rstore/multiplayer/clock'
import { createStore, } from '@rstore/core'
import { compareHLC } from '@rstore/multiplayer/clock'
import { mergeText as merge3 } from '@rstore/multiplayer/text'
import { rebaseTextRange } from '@rstore/multiplayer/text'
import { createHLCClock } from '@rstore/multiplayer/clock'
import { mergeItemFields } from '@rstore/multiplayer/lww'
import { parseMultiplayerMessage } from '@rstore/multiplayer/protocol'
import { definePlugin } from '@rstore/vue'

export const used = [compareHLC, createStore, merge3, rebaseTextRange, createHLCClock, mergeItemFields, parseMultiplayerMessage, definePlugin]
export type Used = [FieldTimestamps, MultiplayerMessage, StoreSchema, HLCString]
