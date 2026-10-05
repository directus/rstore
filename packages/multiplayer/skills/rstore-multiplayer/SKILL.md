---
name: rstore-multiplayer
description: "Use when adding realtime collaboration or multiplayer editing to an rstore app with `@rstore/multiplayer` — merge concurrent edits with field-level last-writer-wins, HLC timestamps and tombstones, resolve cache or form conflicts, merge concurrent text edits in forms, show presence, cursors and typing indicators, relay rooms over WebSocket in Nuxt or any server, build collaborative rich-text documents (Google Docs-like editing, ProseMirror/Tiptap, replacing Yjs) stored as one row per block, or migrate collaboration code to rstore 0.9; also use before writing custom merge logic for realtime updates, timestamp comparison in writeItem, a hand-rolled presence websocket, typing-indicator protocol, or home-made CRDT/OT layer — prefer `createMultiplayerPlugin`, `createPresenceChannel`, `createMultiplayerServer`, the experimental collab documents (`createCollabClient`, `createCollabServer`, `collabPlugin`, `useRstoreCollabDocument`) and the Nuxt multiplayer composables; pair with the `rstore-vue` skill for store, cache and form behavior."
---

# Rstore Multiplayer

Add field-level LWW merge, tombstones, form text merge, presence, a room relay server and server-ordered rich-text documents to rstore with `@rstore/multiplayer` (experimental, new in v0.9).
Use this skill with the `rstore-vue` skill for store/cache/form semantics; for Nuxt module wiring see the `rstore-nuxt` skill, for Drizzle realtime the `rstore-nuxt-drizzle` skill.

## Documentation map

| Area | Documentation |
| --- | --- |
| Collaboration guide | [https://rstore.akryum.dev/guide/data/collaboration](https://rstore.akryum.dev/guide/data/collaboration) |
| Collaborative documents (OT, experimental) | [https://rstore.akryum.dev/guide/data/collaborative-documents](https://rstore.akryum.dev/guide/data/collaborative-documents) |
| Write metadata and item metadata | [https://rstore.akryum.dev/guide/data/cache#write-metadata](https://rstore.akryum.dev/guide/data/cache#write-metadata), [https://rstore.akryum.dev/guide/data/cache#item-metadata](https://rstore.akryum.dev/guide/data/cache#item-metadata) |
| Persisted item metadata (offline) | [https://rstore.akryum.dev/guide/data/offline#persisted-item-metadata](https://rstore.akryum.dev/guide/data/offline#persisted-item-metadata) |
| Nuxt Multiplayer | [https://rstore.akryum.dev/plugins/nuxt-multiplayer](https://rstore.akryum.dev/plugins/nuxt-multiplayer) |
| Nuxt Multiplayer Server | [https://rstore.akryum.dev/plugins/nuxt-multiplayer-server](https://rstore.akryum.dev/plugins/nuxt-multiplayer-server) |
| 0.8 to 0.9 migration | [https://rstore.akryum.dev/guide/migration/v0_9](https://rstore.akryum.dev/guide/migration/v0_9) |
| Related package skills | `rstore-vue` skill (`@rstore/vue`), `rstore-nuxt-drizzle` skill (`@rstore/nuxt-drizzle`) |
| Skill-local API references | [./references/index.md](./references/index.md) |

## Core concepts

| Primitive | Purpose |
| --- | --- |
| `createMultiplayerPlugin()` | Store plugin: field-level LWW of stamped writes, tombstones, conflict policies, form text merge |
| `metadata: { fieldTimestamps }` / `metadata: { deletedAt }` | Stamps carried by realtime writes, deletes and mutations |
| HLC stamp | `physicalHex:logicalHex:nodeId` string (or number) from `@rstore/multiplayer/clock` |
| Tombstone | Delete stamp that drops older writes so deleted rows are not resurrected |
| `cacheConflict` hook | Same-stamp/different-value conflicts left by the policy |
| `textFieldMerger` | Three-way merge of non-overlapping text edits in form `$rebase` |
| `createPresenceChannel` | Peers, focused fields, cursors and typing over any text transport |
| `createMultiplayerServer` | Transport-agnostic room relay with authorization, identity binding, rate limits |
| `@rstore/nuxt-multiplayer` / `@rstore/nuxt-multiplayer-server` | Nuxt composables/components and Nitro relay endpoint |
| `createCollabClient` / `createCollabServer` (experimental) | Rich-text documents as block rows, ordered by a server (OT): client, sequencer, per-user undo, IME guard |
| `OpLogStore` | Op log + block rows persistence of the sequencer (memory, Drizzle or your own) |
| `bindCollabCache` + `ot` option | Collab blocks as rstore rows, pending edits in a cache layer |

Entries: `@rstore/multiplayer` (plugin + store helpers), `/clock`, `/lww`, `/text`, `/presence`, `/protocol`, `/server`, and the experimental `/ot` and `/prosemirror`.

## Quick start

```ts
import { createMultiplayerPlugin } from '@rstore/multiplayer'
import { createStore } from '@rstore/vue'

const store = await createStore({
  schema,
  plugins: [remotePlugin, createMultiplayerPlugin()],
})

// Realtime frame from your transport
store.$cache.writeItem({
  collection,
  key: frame.key,
  item: frame.record,
  metadata: { fieldTimestamps: frame.fieldTimestamps },
})
```

In Nuxt, export `createMultiplayerPlugin()` from a file in the rstore plugins folder (for example `app/rstore/plugins/multiplayer.ts`).

## Task workflow

1. Pick the tool: stamped realtime rows need the plugin (LWW); concurrent form editing needs `$rebase` + text merge; who-is-here/cursors/typing needs presence (nothing stored in the cache).
2. Install `createMultiplayerPlugin()` once per store. Skip it with Nuxt + Drizzle `ws`: that module installs it (`lww: true, formTextMerge: false`); set `ws.lww: false` before registering your own.
3. Send realtime rows through `store.$cache.writeItem` / `deleteItem` with `metadata.fieldTimestamps` / `metadata.deletedAt`; mutations take the same `metadata`.
4. Choose a `lww.conflictPolicy` (`'lww'`, `'local-wins'`, `'remote-wins'` or a function); observe leftovers with the `cacheConflict` hook.
5. For forms, keep `formTextMerge` on (or `createFormObject({ fieldMerge: textFieldMerger })`) and resolve remaining `$conflicts` with `$resolveConflict` (see the `rstore-vue` skill).
6. For presence, use `createPresenceChannel` (any framework) or `useRstoreMultiplayerChannel` + field/typing composables (Nuxt).
7. Relay rooms with `@rstore/nuxt-multiplayer-server` or `createMultiplayerServer`; always register `multiplayer.authorize` and check `Origin`.
8. For rich-text documents several people type in (experimental): store blocks as `DocNodeRecord` rows, sequence them with `createCollabServer` (Nuxt: `collab: true` + `defineRstoreCollab`), open them with `createCollabClient` (Nuxt: `useRstoreCollabDocument`), bind ProseMirror with `collabPlugin`, and mirror them into a collection with `createMultiplayerPlugin({ ot })` + `bindCollabCache`.

## When you are tempted to write custom merge or presence code

- **Comparing timestamps before `writeItem`, or merging realtime rows by hand** → pass stamps as `metadata: { fieldTimestamps }` / `{ deletedAt }` and let the plugin merge per field and keep tombstones.
- **Custom conflict handling** → `lww.conflictPolicy` function or the `cacheConflict` hook, not a wrapper around cache writes.
- **Writing your own string merge in `$rebase`** → `formTextMerge` / `textFieldMerger`; other merge rules go in a `formFieldMerge` hook (`rstore-vue` skill).
- **Hand-rolled presence/typing WebSocket protocol** → `createPresenceChannel` over your transport, and `createMultiplayerServer` on the server.
- **Need per-row plugin state that survives SSR/reload** → `store.$cache.itemMetadata` namespaces (`rstore-vue` skill).
- **Home-made OT/CRDT for a rich-text editor, or syncing editor JSON through LWW rows** → collab documents (`createCollabClient`, `createCollabServer`, `collabPlugin`).

## Extension points

- `lww.collections` (array or function) scopes LWW to some collections.
- `lww.conflictPolicy` function returns `'local'`, `'remote'`, `{ value }` or `undefined` per field.
- `cacheConflict` hook for telemetry, custom resolution workflows or UI warnings.
- `formFieldMerge` hook (from `@rstore/vue`) for non-text merge rules next to `textFieldMerger`.
- Server hooks `multiplayer.authorize` (access + `setUserId`) and `multiplayer.filter` (per-frame `reject()`).
- Store-less building blocks: `createHLCClock`, `compareHLC`, `stringifyHLC`, `parseHLC` (`/clock`); `mergeItemFields`, `createFieldTimestamps`, `maxStamp`, `applyConflictPolicy` (`/lww`); `diffText`, `mergeText`, `rebaseTextRange` (`/text`).

## Persistence and SSR

- Stamps and tombstones are item metadata (`multiplayer:fields`, `multiplayer:tombstone`): serialized in `getState()` for SSR hydration.
- The offline plugin persists them to IndexedDB and restores them at the first sync, before queued mutations replay; a stale frame after reload still loses against a newer stamp. Queued mutations keep their `metadata`.

## Guardrails

1. Without the plugin, stamped writes overwrite the cached row, deletes leave no tombstone, and development warns about unhandled `fieldTimestamps`/`deletedAt` metadata.
2. Install the plugin once; with Nuxt + Drizzle `ws`, do not add a second one unless `ws.lww: false`.
3. Top-level `writeItem({ fieldTimestamps })`, `deleteItem({ deletedAt })`, `cache.readFieldTimestamps`/`writeFieldTimestamps`, `cache.tombstones` and `createStore({ tombstoneGc })` are pre-0.9: use `metadata`, the store helpers and `createMultiplayerPlugin({ tombstoneGc })`.
4. Since v0.9 form `$rebase` has no default merge: without the plugin (or `fieldMerge`), non-overlapping text edits conflict. `FormFieldConflict` has no `localTimestamp`/`remoteTimestamp`.
5. `hook('cacheConflict', …)` type-checks only with `@rstore/multiplayer` installed.
6. Without a `multiplayer.authorize` handler anyone reaching the endpoint can join any room; without `setUserId()` the first client-sent user id is bound.
7. Typing frames carry only `{ collection, key, field? }`; never send typed content.
8. Remote form updates are untrusted: set `trackedFields` in `useRstoreMultiplayerForm`.
9. Deep imports of `@rstore/nuxt-multiplayer` `runtime/utils/*` broke in v0.9; use `@rstore/multiplayer/protocol` and `/presence`.
10. The codemod scans `.ts` files only; migrate Vue SFC script blocks by hand.
11. Collab documents are experimental: the IME checks on Safari macOS, iOS Safari and Android Gboard are pending. One server process must sequence a given document, the in-memory op log is lost on restart, and block rows must only change through the collab client.
12. A collab `redact` hook must decide on stable properties and hide whole subtrees; ops mixing hidden and visible blocks are rewritten per peer.

## References

| Topic | Description | Reference |
| --- | --- | --- |
| API index | Full map of all API-element references | [api-index](./references/index.md) |
| createMultiplayerPlugin | Store plugin: LWW, tombstones, conflicts, form text merge | [api-create-multiplayer-plugin](./references/api-create-multiplayer-plugin.md) |
| createMultiplayerPlugin({ lww }) | Enable/scope field-level LWW | [api-option-lww](./references/api-option-lww.md) |
| lww.conflictPolicy | Same-stamp conflict resolution | [api-option-conflict-policy](./references/api-option-conflict-policy.md) |
| createMultiplayerPlugin({ tombstoneGc }) | Periodic tombstone removal | [api-option-tombstone-gc](./references/api-option-tombstone-gc.md) |
| createMultiplayerPlugin({ formTextMerge }) | Text merge during form `$rebase` | [api-option-form-text-merge](./references/api-option-form-text-merge.md) |
| metadata.fieldTimestamps | Per-field stamps on writes and mutations | [api-field-timestamps](./references/api-field-timestamps.md) |
| metadata.deletedAt | Delete stamp recording a tombstone | [api-deleted-at](./references/api-deleted-at.md) |
| getFieldTimestamps | Read stored field stamps | [api-get-field-timestamps](./references/api-get-field-timestamps.md) |
| setFieldTimestamps | Write stored field stamps | [api-set-field-timestamps](./references/api-set-field-timestamps.md) |
| getTombstone | Read a tombstone | [api-get-tombstone](./references/api-get-tombstone.md) |
| tombstoneEntries | Iterate tombstones | [api-tombstone-entries](./references/api-tombstone-entries.md) |
| gcTombstones | Remove old tombstones manually | [api-gc-tombstones](./references/api-gc-tombstones.md) |
| cacheConflict hook | Unresolved LWW conflicts | [api-cache-conflict](./references/api-cache-conflict.md) |
| textFieldMerger | Three-way text merger for forms | [api-text-field-merger](./references/api-text-field-merger.md) |
| @rstore/multiplayer/clock | HLC timestamps | [api-entry-clock](./references/api-entry-clock.md) |
| @rstore/multiplayer/lww | LWW functions | [api-entry-lww](./references/api-entry-lww.md) |
| @rstore/multiplayer/text | Text diff/merge/cursor rebasing | [api-entry-text](./references/api-entry-text.md) |
| @rstore/multiplayer/protocol | Wire frames, guards, sanitization | [api-entry-protocol](./references/api-entry-protocol.md) |
| parseMultiplayerMessage | Validate a raw frame | [api-parse-multiplayer-message](./references/api-parse-multiplayer-message.md) |
| createPresenceChannel | Presence protocol over any transport | [api-create-presence-channel](./references/api-create-presence-channel.md) |
| channel.setTextCursor | Share caret/selection | [api-presence-set-text-cursor](./references/api-presence-set-text-cursor.md) |
| channel.notifyTyping | Typing indicator | [api-presence-notify-typing](./references/api-presence-notify-typing.md) |
| channel.clearFocus | Clear focused field | [api-presence-clear-focus](./references/api-presence-clear-focus.md) |
| createMultiplayerServer | Room relay server | [api-create-multiplayer-server](./references/api-create-multiplayer-server.md) |
| createMultiplayerServerHooks | Server hook bus | [api-create-multiplayer-server-hooks](./references/api-create-multiplayer-server-hooks.md) |
| multiplayer.authorize hook | Room access and identity binding | [api-hook-multiplayer-authorize](./references/api-hook-multiplayer-authorize.md) |
| multiplayer.filter hook | Per-frame broadcast filter | [api-hook-multiplayer-filter](./references/api-hook-multiplayer-filter.md) |
| isOriginAllowed | Upgrade Origin check | [api-is-origin-allowed](./references/api-is-origin-allowed.md) |
| @rstore/nuxt-multiplayer module | Nuxt client module setup | [api-nuxt-multiplayer-module](./references/api-nuxt-multiplayer-module.md) |
| useRstoreMultiplayerChannel | Join a room in Nuxt | [api-use-rstore-multiplayer-channel](./references/api-use-rstore-multiplayer-channel.md) |
| useRstoreMultiplayerForm | Sync a form with the room | [api-use-rstore-multiplayer-form](./references/api-use-rstore-multiplayer-form.md) |
| useRstoreMultiplayerField | Share focused field | [api-use-rstore-multiplayer-field](./references/api-use-rstore-multiplayer-field.md) |
| useRstoreMultiplayerTextField | Share focus and selection | [api-use-rstore-multiplayer-text-field](./references/api-use-rstore-multiplayer-text-field.md) |
| useRstoreMultiplayerTyping | Typing indicators in Nuxt | [api-use-rstore-multiplayer-typing](./references/api-use-rstore-multiplayer-typing.md) |
| RstoreMultiplayerPresenceList | Connected users component | [api-rstore-multiplayer-presence-list](./references/api-rstore-multiplayer-presence-list.md) |
| RstoreMultiplayerTextCursorOverlay | Remote carets component | [api-rstore-multiplayer-text-cursor-overlay](./references/api-rstore-multiplayer-text-cursor-overlay.md) |
| @rstore/nuxt-multiplayer-server module | Nuxt relay endpoint module | [api-nuxt-multiplayer-server-module](./references/api-nuxt-multiplayer-server-module.md) |
| rstoreMultiplayerServer.endpoint | WebSocket route | [api-option-endpoint](./references/api-option-endpoint.md) |
| maxRoomSize | Peers per room | [api-option-max-room-size](./references/api-option-max-room-size.md) |
| maxMessageBytes | Frame size limit | [api-option-max-message-bytes](./references/api-option-max-message-bytes.md) |
| rateLimit | Per-peer token bucket | [api-option-rate-limit](./references/api-option-rate-limit.md) |
| rstoreMultiplayerServer.allowedOrigins | Upgrade origin allow-list | [api-option-allowed-origins](./references/api-option-allowed-origins.md) |
| rstoreMultiplayerServerHooks | Nitro hook bus auto-import | [api-rstore-multiplayer-server-hooks](./references/api-rstore-multiplayer-server-hooks.md) |
| multiplayer-0.9 codemod | 0.8 to 0.9 migration codemod | [api-codemod-multiplayer-0-9](./references/api-codemod-multiplayer-0-9.md) |
| @rstore/multiplayer/ot | Collab document ops, Deltas, helpers (experimental) | [api-entry-ot](./references/api-entry-ot.md) |
| createCollabClient | Collab document client | [api-create-collab-client](./references/api-create-collab-client.md) |
| createCollabUndoManager | Per-user undo of a collab client | [api-create-collab-undo-manager](./references/api-create-collab-undo-manager.md) |
| createCollabServer | Collab document sequencer | [api-create-collab-server](./references/api-create-collab-server.md) |
| sequenceTransaction | Stateless sequencing on an op log store | [api-sequence-transaction](./references/api-sequence-transaction.md) |
| OpLogStore | Sequencer persistence interface and retention | [api-op-log-store](./references/api-op-log-store.md) |
| createMemoryOpLogStore | In-memory op log store | [api-create-memory-op-log-store](./references/api-create-memory-op-log-store.md) |
| collab redact hook | Per-peer block visibility | [api-hook-collab-redact](./references/api-hook-collab-redact.md) |
| createMultiplayerPlugin({ ot }) | Version-ordered block collections | [api-option-ot](./references/api-option-ot.md) |
| bindCollabCache | Mirror a collab document into a collection | [api-bind-collab-cache](./references/api-bind-collab-cache.md) |
| collabPlugin | ProseMirror binding | [api-collab-plugin](./references/api-collab-plugin.md) |
| useRstoreCollabDocument | Open a collab document in Nuxt | [api-use-rstore-collab-document](./references/api-use-rstore-collab-document.md) |
| rstoreMultiplayerServer.collab | Serve collab documents on the endpoint | [api-option-collab](./references/api-option-collab.md) |
| defineRstoreCollab | Configure the Nitro sequencer | [api-define-rstore-collab](./references/api-define-rstore-collab.md) |
| Base @rstore/vue skill | Store, cache hooks, write/item metadata, forms | `rstore-vue` skill |

## Further reading

- Collaboration guide: [https://rstore.akryum.dev/guide/data/collaboration](https://rstore.akryum.dev/guide/data/collaboration)
- Collaborative documents: [https://rstore.akryum.dev/guide/data/collaborative-documents](https://rstore.akryum.dev/guide/data/collaborative-documents)
- Cache docs: [https://rstore.akryum.dev/guide/data/cache](https://rstore.akryum.dev/guide/data/cache)
- Form rebasing: [https://rstore.akryum.dev/guide/data/form#rebasing-and-conflicts-for-collaboration](https://rstore.akryum.dev/guide/data/form#rebasing-and-conflicts-for-collaboration)
- Offline docs: [https://rstore.akryum.dev/guide/data/offline](https://rstore.akryum.dev/guide/data/offline)
- Nuxt Multiplayer: [https://rstore.akryum.dev/plugins/nuxt-multiplayer](https://rstore.akryum.dev/plugins/nuxt-multiplayer)
- Nuxt Multiplayer Server: [https://rstore.akryum.dev/plugins/nuxt-multiplayer-server](https://rstore.akryum.dev/plugins/nuxt-multiplayer-server)
- Migration 0.8 to 0.9: [https://rstore.akryum.dev/guide/migration/v0_9](https://rstore.akryum.dev/guide/migration/v0_9)
- @rstore/vue skill: `rstore-vue`
