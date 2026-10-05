import type { FieldTimestamps, MultiplayerMessage, StoreSchema } from '@rstore/shared'
import type { HLCString } from '@rstore/core'
import { compareHLC, createStore, mergeText as merge3, rebaseTextRange } from '@rstore/core'
import { createHLCClock, mergeItemFields } from '@rstore/core'
import { parseMultiplayerMessage } from '@rstore/shared'
import { definePlugin } from '@rstore/vue'

export const used = [compareHLC, createStore, merge3, rebaseTextRange, createHLCClock, mergeItemFields, parseMultiplayerMessage, definePlugin]
export type Used = [FieldTimestamps, MultiplayerMessage, StoreSchema, HLCString]
