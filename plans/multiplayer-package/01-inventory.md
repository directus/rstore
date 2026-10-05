# 01: Inventory

Snapshot of `main` @ `75c1b95`. "Importers" lists runtime `src` importers, excluding tests, e2e and generated `.nuxt` files.

Verdicts:

- **move:** goes to `@rstore/multiplayer`
- **adapter:** stays in a Nuxt package as a thin wrapper
- **core:** stays generic in core
- **replace:** removed and rebuilt on an extension point from [02](./02-core-extension-points.md)

## History

| Commit | Date | What |
|---|---|---|
| `5705f33` | 2026-03-11 | `feat: op-log based form with CRDT`: `core/src/crdt.ts` (468 lines), `shared/types/crdt.ts`, `cacheConflict`, form `$rebase`/`$conflicts`, playground collab editor, `docs/plugins/yjs.md` |
| `5a371f3` | 2026-03-11 | `refactor: extract collaboration features in separate package`: `@rstore/nuxt-multiplayer` |
| `de59476` | 2026-03-12 | Text cursor rebasing (`rebaseTextRange`), focused-caret preservation |
| `56c9615` | 2026-05-02 | HLC, tombstones and GC, LWW wiring in the vue cache, nuxt-drizzle protocol v2 stamps, `@rstore/nuxt-multiplayer-server` |
| `6fa8546` | 2026-06-23 | Removed `@rstore/yjs` (the plugin and awareness helper, 1.4k lines) |
| `9a65bb1` | 2026-06-23 | Split `crdt.ts`/`hlc.ts` into folders, `core/test/public-exports.spec.ts` |
| `ff1049d` | 2026-08-01 | **BREAKING**: `clientId` on every frame, payload sanitization, reliable heartbeats |
| `5966b4d` | 2026-08-01 | Server identity binding, origin check |
| `0f29338` | 2026-09-09 | Protocol types and guards moved to `@rstore/shared` (deduplicated from both Nuxt packages) |

None of these commits is in a tag (`git tag --contains` is empty), so everything is unreleased.

## `@rstore/core`

| Feature | Files | Public exports | Importers | Verdict |
|---|---|---|---|---|
| Hybrid logical clock | `src/hlc/{clock,error,serialization,types}.ts` | `HybridLogicalClock`, `createHLCClock`, `getDefaultClock`, `setDefaultClock`, `HLCClockSkewError`, `stringifyHLC`, `parseHLC`, `compareHLC`, `HLCTimestamp`, `HLCString`, `HLCClockSkewInfo`, `HybridLogicalClockOptions`, `DEFAULT_MAX_CLOCK_SKEW_MS` | `nuxt-drizzle` (`server/utils/realtime.ts`, `server/plugins/publish-hooks.ts`, `utils/realtime-stamps.ts`, `plugin-realtime.ts`) | move → `/clock` |
| Node id | `src/utils/nodeId.ts` | `createNodeId` (re-exported through `utils`) | HLC only | move → `/clock` |
| Field LWW | `src/crdt/fields.ts` | `mergeItemFields`, `createFieldTimestamps`, `touchFields` | `vue` (`cache/writes.ts`) | move → `/lww` |
| Field diff | `src/crdt/fields.ts` | `diffFields` | `vue` (`form/rebase.ts`) | core (`utils/fields.ts`) |
| Deep equality | `src/utils/equality.ts`, re-exported by `crdt/index.ts` | `fieldValuesEqual` | core `mutation/optimistic.ts`, `vue` `form/state.ts` | core (export from `utils`) |
| Text diff | `src/crdt/textDiff.ts` | `diffText`, `applyTextChanges` | — (internal) | move → `/text` |
| Three-way text merge | `src/crdt/textMerge.ts` | `mergeText`, `MergeTextOptions` | `vue` (`form/rebase.ts`) | move → `/text`, consumed through `formFieldMerge` |
| Cursor rebase | `src/crdt/textRebase.ts` | `rebaseTextPosition`, `rebaseTextRange`, `TextRange`, `TextPositionAffinity`, `RebaseTextRangeOptions` | `nuxt-multiplayer` (`utils/multiplayerTextCursor.ts`) | move → `/text` |
| Tombstones | `src/tombstone.ts` | `Tombstone`, `TombstoneStore`, `createTombstoneStore`, `tombstoneKey`, `isTombstone`, `shouldResurrect`, `gcTombstones`, `scheduleTombstoneGc`, `ScheduleTombstoneGcOptions`, `TombstoneGcSweepInfo` | `vue` (`cache/context.ts`, `api.ts`, `writes.ts`, `types.ts`) | move → `/lww` |
| Write metadata passthrough | `src/mutation/finalize/helpers.ts` (`createSingleApplyOptions`, `createManyApplyOptions`) | — | — | replace → `metadata` passthrough |

## `@rstore/shared`

| Feature | File | Exports | Verdict |
|---|---|---|---|
| LWW types | `types/crdt.ts` | `FieldTimestampValue`, `FieldTimestamps`, `FieldConflict`, `MergeResult`, `TextChange`, `TextMergeConflict`, `TextMergeResult` | move (types stay physically in shared during 0.9 as deprecated re-export sources, see [05](./05-migration.md)) |
| Protocol types | `types/multiplayer.ts` | `MultiplayerTextCursor`, `MultiplayerUser`, `MultiplayerUpdateMessage`, `MultiplayerPresenceMessage`, `MultiplayerLeaveMessage`, `MultiplayerMessage` | move → `/protocol` |
| Protocol guards | `utils/multiplayer.ts` | `isMultiplayerId`, `isMultiplayerTextCursor`, `isMultiplayerUser`, `isMultiplayerMessage`, `parseMultiplayerMessage` | move → `/protocol` |
| Cache contract, LWW members | `types/cache.ts` | `CacheTombstone`, `CacheTombstones`, `Cache.writeItem.fieldTimestamps`, `Cache.deleteItem.deletedAt`, `readFieldTimestamps`, `writeFieldTimestamps`, `tombstones`, `gcTombstones` | replace → `metadata`, `itemMetadata` |
| Mutation options | `types/mutation.ts` | `ApplyMutationOptions.fieldTimestamps`, `.deletedAt` (and by extension `FinalizeMutationOptions`, `MutateOptions`, `CollectionMutateOptions`) | replace → `metadata` |
| Conflict hook | `types/hooks/cache.ts` | `cacheConflict` | move (augmented by multiplayer) |
| Form conflict | `types/form.ts` via `FieldConflict` | `$conflicts: FieldConflict[]` | replace → `FormFieldConflict` |

## `@rstore/vue`

| Feature | Files | Verdict |
|---|---|---|
| Field timestamp state | `cache/types.ts` (`state.fieldTimestamps`), `context.ts` (`removeFieldTimestampsForItem`), `api.ts` (`readFieldTimestamps`, `writeFieldTimestamps`, clear, clearCollection) | replace → item metadata store |
| LWW write path | `cache/writes.ts` (`writeItemNow` tombstone check, `writeMutableItem` branch, `mergeTimestampedItem`, `ensureCollectionTimestamps`) | replace → `cacheBeforeWriteItem` |
| Causal delete | `cache/queue.ts` (`processQueuedDelete`), `cache/mutations.ts` (`deletedAt` passthrough) | replace → `cacheBeforeDeleteItem` plus metadata |
| Tombstone store and GC timer | `cache/context.ts`, `cache/types.ts` (`tombstoneGc`, `stopTombstoneGc`), `store.ts` (`tombstoneGc` option), `api.ts` (`tombstones`, `gcTombstones`, `dispose`) | move → plugin |
| SSR causality | `api.ts#getState` (`fieldTimestamps`, `tombstones`), `hydration.ts#restoreCausality` (numeric key restore), `types.ts` (`CustomCacheState` augmentation) | replace → generic `itemMetadata` serialization (keeps numeric-key restore) |
| Form rebase merge | `form/rebase.ts` (`collectFieldConflict`, `rebaseTextFieldSetOps` → `mergeText`) | replace → `formFieldMerge` hook |
| Form conflicts API | `form/createFormObject.ts` (`$rebase`, `$conflicts`, `$resolveConflict`, `$onConflict`), `form/types.ts` | core (forms), type changes to `FormFieldConflict` |

## `@rstore/nuxt-multiplayer` (adapter)

| Feature | File | Verdict |
|---|---|---|
| Room channel: WebSocket, peers map, heartbeat (5 s), stale eviction (15 s), presence aggregation by user, self-echo by `clientId`, cursor rebase | `composables/useRstoreMultiplayerChannel.ts` (292 lines) | split: agnostic `createPresenceChannel(transport)` → `/presence`; the composable becomes a Vue/Nuxt wrapper (refs, `useWebSocket`, `useRuntimeConfig`) |
| Form sync: broadcast changes, sanitize, rebase, caret preservation, undo/redo with broadcast | `composables/useRstoreMultiplayerForm.ts` (237 lines) | adapter (DOM caret logic). Sanitization → `/protocol` |
| Field focus with debounced blur | `composables/useRstoreMultiplayerField.ts` | adapter |
| Text field cursor events | `composables/useRstoreMultiplayerTextField.ts` | adapter. `normalizeSelectionDirection` is duplicated with `useRstoreMultiplayerForm.ts` → one copy in the adapter `utils/` |
| Peer guard, message validation with dev warning | `utils/messageGuards.ts` | `isMultiplayerPeerStrict` → `/presence`. `validateMultiplayerMessage` duplicates `parseMultiplayerMessage` → removed, with an `onInvalid` callback added to `parseMultiplayerMessage` |
| Update sanitization | `utils/sanitizeUpdate.ts` | move → `/protocol` |
| Cursor helpers | `utils/multiplayerTextCursor.ts` | move → `/presence` |
| DOM caret coordinates | `utils/textCursor.ts` (175 lines) | adapter |
| UI | `components/RstoreMultiplayerPresenceList.vue`, `RstoreMultiplayerTextCursorOverlay.client.vue` | adapter |

## `@rstore/nuxt-multiplayer-server` (adapter)

| Feature | File | Verdict |
|---|---|---|
| Room and registry (snapshot broadcast, capacity) | `runtime/server/rooms.ts` | move → `/server` |
| Identity binding (trust-on-first-frame or hook-bound) | `runtime/server/identity.ts` | move → `/server` |
| Token-bucket rate limit | `runtime/server/rateLimit.ts` | move → `/server` |
| Origin policy | `runtime/server/origin.ts` | move → `/server` |
| Hook registry (`multiplayer.authorize`, `multiplayer.filter`) | `runtime/server/hooks.ts` | move → `/server` (`createMultiplayerServer({ hooks })`). Nuxt keeps the `rstoreMultiplayerServerHooks` singleton export |
| Message pipeline (size, rate, parse, authorize once per room, identity, filter, broadcast, synthesized leave) | `runtime/server/ws-handler.ts` (207 lines) | split: transport-agnostic `server.handleMessage(peer, text)` / `server.handleClose(peer)` → `/server`; h3 `defineWebSocketHandler` and `upgrade` stay |
| Module options, template, handler registration | `module.ts`, `handler-entry.ts` | adapter |
| Compatibility re-exports | `guards.ts`, `types.ts` | adapter (re-export from `@rstore/multiplayer/protocol`) |

## `@rstore/nuxt-drizzle`

| Feature | File | Verdict |
|---|---|---|
| Server HLC install | `server/plugins/publish-hooks.ts` (`createHLCClock`, `setDefaultClock`) | uses `/clock`, adapter-owned clock instance |
| Publish stamping: uniform per-record stamp, `deletedAt` | `server/utils/realtime.ts` (`buildUniformFieldTimestamps`) | uses `/clock` |
| Per-peer frame narrowing of `fieldTimestamps` | `server/realtime/subscriptions.ts` | unchanged (wire field names are kept) |
| Client apply | `plugin-realtime.ts` (`writeItem({ fieldTimestamps })`, `deleteItem({ deletedAt })`, `lastStampPerCollection`) | `metadata: { fieldTimestamps }` / `{ deletedAt }` |
| Stamp helpers | `utils/realtime-stamps.ts` (`maxPayloadStamp`, `stampToDate`) | uses `/clock`. `maxPayloadStamp` duplicates `maxTimestamp` in `core/src/tombstone.ts` → one `maxStamp` in `/lww` |
| Protocol v2 types | `utils/realtime.ts` (`fieldTimestamps`, `deletedAt`) | type imports switch to `@rstore/multiplayer` |

## `@rstore/offline`

No LWW, HLC or multiplayer code. Relevant facts:

- **Replay.** Queued ops replay full items ordered by wall-clock `time` (`plugin/queuedOperations.ts`). There is no write metadata.
- **Persistence.** IndexedDB mirrors rows only (`plugin/mutations.ts`). Field timestamps and tombstones are lost on reload, so the first stamped frame after reload always wins.
- **Conflicts.** The docs say conflicts are "application-specific" (`docs/guide/data/offline.md:166`).

Verdict: stays. It gains generic item-metadata persistence and metadata on queued ops (S8).

## Other

| Item | Verdict |
|---|---|
| `packages/playground-ws-server` | Generic Cloudflare Durable Object pub/sub for the playground (`subscribe`/`publish` only). It does not route `multiplayer:*` frames, so it is not a multiplayer server. Leave it; note it in the README |
| `packages/playground` collab editor and `server/routes/_ws.ts` | Consumer. Switches to `@rstore/multiplayer` imports. `setBaseValue` writes a peer's *unsaved* form state into the cache without stamps. Keep it for the demo but flag it in docs |
| Docs | Only `docs/guide/plugin/hooks.md` (`cacheConflict`), `docs/guide/data/form.md` (`$rebase`, conflicts) and `docs/plugins/nuxt-drizzle.md` (stamp narrowing) mention any of this. There is no page for the multiplayer packages; their READMEs are the generic repo README |
| Devtools | No references |

## Tests touching the inventory

| Suite | Moves to |
|---|---|
| `core/test/hlc.spec.ts` (380), `crdt.spec.ts` (688), `crdt-types.test-d.ts`, `tombstone.spec.ts`, `tombstone-gc.spec.ts` | `multiplayer/test/{clock,lww,text}/` via `git mv` |
| `core/test/public-exports.spec.ts` (HLC/text cases) | Split: the core copy asserts the deprecated re-exports (deleted in 0.10); the multiplayer copy asserts subpath exports |
| `shared/test/utils/multiplayer.spec.ts` | `multiplayer/test/protocol/` |
| `vue/test/cache-tombstone-lifecycle.spec.ts`, `vue/test/integration/realtime-contract.spec.ts` | Kept in vue as **parity** suites run with `createMultiplayerPlugin()` (S3), then as multiplayer integration suites (S4) |
| `vue/test/integration/hydration.spec.ts`, `cache/public-protocol.spec.ts`, `garbage-collection/*`, `harness/realtime.spec.ts`, `query/mixed-policy-pagination.spec.ts`, `component-lifecycle.spec.ts` | Stay. Update stamps to `metadata` |
| `vue/test/form/rebase-resolution.spec.ts` | Stays. Add a merger-hook case and a no-merger conflict case |
| `test/utils/store/{coreStack,realCacheStore,fakeRemoteRealtime}.ts` | Stay. The fake remote emits `metadata` |
| `nuxt-multiplayer/test/*`, `nuxt-multiplayer-server/test/*` | Logic cases move with the code; the adapters keep wiring cases |
| `playground/e2e/collab-*.spec.ts` | Stay as end-to-end gates |

## Gaps found while inventorying

These are not fixed by the move itself. They are listed so that the slices do not cement them.

1. **Local commits are never stamped.** `create`/`update` results are written without `fieldTimestamps`, so stored stamps go stale. A later frame with an older stamp but newer than the stored one can overwrite a committed value. The plugin can stamp from server responses when connectors return stamps (S8).
2. **nuxt-drizzle stamps every field of a record with one HLC** (`buildUniformFieldTimestamps`). Field-level LWW therefore behaves like row-level LWW for server frames.
3. **Form conflicts carry fake timestamps.** `rebase.ts` sets both to `Date.now()` (D6).
4. **Multiplayer `update` frames are unsequenced and state-based.** Convergence across more than two peers is untested.
5. **Offline loses stamps and tombstones** on reload and replay (S8).
6. **Duplicates:** `validateMultiplayerMessage` vs `parseMultiplayerMessage`; `normalizeSelectionDirection` twice; `maxPayloadStamp` vs `maxTimestamp`.
