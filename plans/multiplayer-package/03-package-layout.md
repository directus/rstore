# 03: Package layout

## Dependency graph

```text
@rstore/shared ◄── @rstore/multiplayer ◄── @rstore/nuxt-multiplayer          (Nuxt client adapter)
      ▲                    ▲   ▲      ◄── @rstore/nuxt-multiplayer-server   (Nitro/crossws adapter)
      │                    │   └───────── @rstore/nuxt-drizzle               (stamps frames, auto-installs LWW plugin)
@rstore/core ──(0.9 only, deprecated re-exports)──┘
      ▲
@rstore/vue          (no multiplayer import after S4/S5)
@rstore/offline      (no multiplayer import; persists generic item metadata)
```

- `@rstore/multiplayer` never imports `@rstore/core` or `@rstore/vue` (D2). Plugins are typed with `Plugin` from shared.
- No package imports Vue or Nuxt. `/server` imports nothing from Node: the transport is injected.
- `@rstore/core` depends on `@rstore/multiplayer` only during 0.9.x, for deprecated re-exports ([05](./05-migration.md)).

## `@rstore/multiplayer`

Build: `unbuild` with multiple entries, `sideEffects: false`. Each subpath is independently tree-shakable. Every source file stays under 300 lines.

```text
packages/multiplayer/
  package.json            exports: ".", "./clock", "./lww", "./text", "./presence", "./protocol", "./ot", "./server"
  build.config.ts         entries: src/index.ts + one per subpath
  src/
    index.ts              createMultiplayerPlugin, re-exports of clock/lww/text/protocol public types
    plugin/
      index.ts            createMultiplayerPlugin(options): Plugin — wires the parts below
      lww.ts              cacheBeforeWriteItem/cacheBeforeDeleteItem handlers (merge, tombstone check, consume)
      tombstoneGc.ts      timer start/stop via dispose hook
      formMerge.ts        formFieldMerge handler (text three-way merge)
      stamping.ts         beforeMutation/afterMutation: attach stamps from connector results (opt-in)
      augment.ts          CustomCacheWriteMetadata, HookDefinitions (cacheConflict) augmentation
      store.ts            getFieldTimestamps / getTombstone / gcTombstones helpers over cache.itemMetadata
    clock/                from core/src/hlc/* + utils/nodeId.ts (unchanged logic)
      clock.ts  error.ts  serialization.ts  types.ts  nodeId.ts  index.ts
    lww/                  from core/src/crdt/fields.ts (minus diffFields) + core/src/tombstone.ts
      fields.ts           mergeItemFields, createFieldTimestamps, touchFields, maxStamp
      policies.ts         ConflictPolicy: 'lww' | 'local-wins' | 'remote-wins' | custom fn (new; default 'lww')
      tombstone.ts        Tombstone helpers (shouldResurrect, isTombstone) — store now = itemMetadata namespace
      types.ts            FieldTimestamps, FieldTimestampValue, FieldConflict, MergeResult
      index.ts
    text/                 from core/src/crdt/text*.ts
      diff.ts  merge.ts  rebase.ts  types.ts  index.ts
    protocol/             from shared/src/{types,utils}/multiplayer.ts + nuxt-multiplayer sanitizeUpdate.ts
      types.ts            frames (update/presence/leave + typing + ot frames, see 04)
      guards.ts           isMultiplayer* guards, parseMultiplayerMessage(raw, { onInvalid? })
      sanitize.ts         sanitizeMultiplayerUpdate
      version.ts          PROTOCOL_VERSION, negotiation helpers (hello/ack frames)
      index.ts
    presence/             framework-agnostic channel core extracted from useRstoreMultiplayerChannel
      channel.ts          createPresenceChannel({ roomId, transport, user, heartbeatMs, staleMs, now })
      peers.ts            peer map, stale eviction, per-user aggregation, isMultiplayerPeerStrict
      cursor.ts           rebaseMultiplayerTextCursor, areMultiplayerTextCursorsEqual
      typing.ts           typing indicator state (no content), auto-expiry
      user.ts             createMultiplayerUser (palette)
      types.ts  index.ts
    ot/                   new, see 04 (only after X1 passes)
      delta.ts  transform.ts  compose.ts  invert.ts  apply.ts  marks.ts  structure.ts
      client.ts  undo.ts  composition.ts  pending.ts  binding.ts  types.ts  index.ts
    server/               from nuxt-multiplayer-server runtime/server/* (minus h3/crossws/Nuxt)
      server.ts           createMultiplayerServer({ hooks, limits }) → { handleMessage, handleClose }
      rooms.ts  identity.ts  rateLimit.ts  origin.ts  hooks.ts  types.ts
      sequencer.ts        OT sequencer (X2): version, transform-on-receive, op log interface
      oplog.ts            OpLogStore interface + in-memory implementation
      index.ts
  test/                   mirrors src/ (moved suites + new)
```

### Public plugin API

```ts
// packages/multiplayer/src/plugin/index.ts
export interface MultiplayerPluginOptions {
  /** Field-level LWW on stamped writes. @default true */
  lww?: boolean | {
    /** Collections to apply to. @default all */
    collections?: string[] | ((collection: ResolvedCollection) => boolean)
    /** Equal-stamp, different-value resolution. @default 'lww' (keep local, emit cacheConflict) */
    conflictPolicy?: ConflictPolicy
  }
  /** Tombstone GC. `false` disables. Defaults match today: 60 s sweep, 24 h TTL, client only. */
  tombstoneGc?: false | { intervalMs?: number, ttlMs?: number }
  /** Register the three-way text merger for form `$rebase`. @default true */
  formTextMerge?: boolean
  /** Clock for local stamps. @default a new HybridLogicalClock per plugin instance */
  clock?: HybridLogicalClock
}

/** Create the rstore plugin that applies multiplayer cache semantics. */
export function createMultiplayerPlugin(options?: MultiplayerPluginOptions): Plugin
```

- **Store install.** `createStore({ plugins: [createMultiplayerPlugin()] })`.
- **Nuxt install.** A plugin file in the app's rstore plugins dir, or the nuxt-drizzle auto-install (S8). The auto-install uses the same `addTemplate` + `addPluginImport` pattern as `nuxt-drizzle/src/module/offline.ts`.
- **Category.** `processing`. It has no `after` constraints: cache hooks are order-independent with one LWW handler.

### Subpath contents vs user request

| Requested capability | Subpath | Origin |
|---|---|---|
| Field-level LWW/CRDT merge | `/lww`, plugin | core `crdt/fields.ts`, vue `writes.ts` |
| Per-field timestamps | `/clock`, `/lww`, `itemMetadata` namespace | core `hlc/*`, vue `state.fieldTimestamps` |
| Conflict detection and resolution policies | `/lww/policies.ts`, `cacheConflict` | new policies; hook from shared |
| Text merge and rebase | `/text` | core `crdt/text*.ts` |
| Presence and cursor models | `/presence` | `nuxt-multiplayer` channel and cursor utils |
| Typing indicators without content | `/presence/typing.ts`, `protocol` frame `multiplayer:typing { roomId, clientId, userId, target: { collection, key, field? } \| null }` | new |
| Transport-agnostic message protocol | `/protocol` | shared protocol + sanitize + version negotiation |
| Server-side sequencing helpers | `/server/sequencer.ts`, `/server/oplog.ts` | new (X2) |

## Related packages

### `@rstore/nuxt-multiplayer`: stays as the Nuxt client adapter

Keeps:

- `useRstoreMultiplayerChannel`: wraps `createPresenceChannel`, with `useWebSocket` as transport, `useRuntimeConfig` for the endpoint, and refs from `channel.subscribe`.
- `useRstoreMultiplayerForm`, `useRstoreMultiplayerField`, `useRstoreMultiplayerTextField`.
- DOM `textCursor.ts`, both components.

Removes:

- `messageGuards.ts`: replaced by `parseMultiplayerMessage(raw, { onInvalid: devWarn })`.
- `sanitizeUpdate.ts`, `multiplayerTextCursor.ts`.
- The duplicated `normalizeSelectionDirection`: one copy in `utils/selection.ts`.

Adds:

- `useRstoreMultiplayerTyping(channel, target)`.
- Later (X2): `useRstoreCollabDocument` for OT. The Tiptap binding is not a Nuxt concern: it lives in `@rstore/multiplayer/ot` as a framework-agnostic ProseMirror binding with `prosemirror-*` as optional peers, or in a separate `@rstore/prosemirror` if peers prove awkward (X1 decides).

Composables stay Nuxt-only (Q3).

### `@rstore/nuxt-multiplayer-server`: stays as the Nitro adapter

`ws-handler.ts` shrinks to:

- `upgrade`: origin check from `/server/origin` plus the missing-authorize warning.
- `message`: `server.handleMessage(asRoomPeer(peer), message.text())`.
- `close`: `server.handleClose(peer.id)`.

`rstoreMultiplayerServerHooks` remains the Nitro-facing singleton. It is the `hooks` instance passed to `createMultiplayerServer`. The module options are unchanged. The OT sequencer is enabled with a new `collab: { opLog: OpLogStore }` option in X2.

### `@rstore/offline`: stays separate (D8)

It is not merged into multiplayer: offline is persistence and replay, and works with any backend. Changes (S8), all generic:

- **Persist item metadata.** Namespaces opt in (`register(ns, { lifecycle, serialize, persist?: true })`). IndexedDB gets a `__meta` store keyed `ns:collection:key`, loaded before the first cache read. This fixes stamps and tombstones lost on reload.
- **Keep write metadata on queued ops.** `OfflineQueuedOperation.metadata` is replayed with the mutation, so replays carry their original stamps.
- **Storage reuse.** `/ot` persists pending OT ops through a minimal `KeyValueStorage` interface (`get`/`set`/`delete`/`keys`) defined in `@rstore/multiplayer`. `@rstore/offline` already exports `useOfflineStorage()`/`OfflineStorage` and adds a `toKeyValueStorage(storage, storeName)` adapter. Multiplayer never imports offline.

### `@rstore/nuxt-drizzle`

- **Server.** `publish-hooks.ts` creates the clock with `createHLCClock(nodeId)` from `@rstore/multiplayer/clock` and stores it in a module-local variable, not the global default (Q13). `server/utils/realtime.ts` stamps with it.
- **Client.** `plugin-realtime.ts` writes `metadata: { fieldTimestamps }` / `metadata: { deletedAt }`. The module option `realtime.lww` (default `true`) auto-registers `createMultiplayerPlugin({ lww: true, formTextMerge: false })` through a `#build/rstore-drizzle-multiplayer-plugin.ts` template plus `addPluginImport`, mirroring `module/offline.ts`.
- **Wire protocol v2 is unchanged.** `fieldTimestamps`/`deletedAt` stay as frame field names.
- **Dependency.** `@rstore/multiplayer` is added to `dependencies`. It is small and tree-shaken to `/clock` + `/lww` + plugin.

### `packages/playground-ws-server`

Unchanged. Its README gets one line: it is generic pub/sub and does not route `multiplayer:*` frames; use `@rstore/nuxt-multiplayer-server` for rooms.

## Workspace wiring

| File | Change |
|---|---|
| `pnpm-workspace.yaml` | none (glob) |
| `test/utils/sourceAliases.ts` | Add `@rstore/multiplayer` plus one exact alias per subpath (pattern of `@rstore/connector-toolkit/vite` in `vitest.config.ts`) |
| `vitest.config.ts` | Nothing new: the `unit` project globs `packages/*/test` |
| `packages/{core,shared,vue}/tsconfig.json`, `tsconfig.integration.json` | `paths` for `@rstore/multiplayer/*` |
| `test/package-test-scripts.spec.ts` | New package must declare the standard `test` script |
| `eslint.config.mjs` | none expected |
| `scripts/` release list | Add the package if releases enumerate packages |
