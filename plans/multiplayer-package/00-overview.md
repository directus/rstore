# Multiplayer package: overview

- Status: draft
- Base: `main` @ `75c1b95` (`@rstore/*` 0.8.4)
- Date: 2026-10-02

All multiplayer and collaboration code leaves `@rstore/core`, `@rstore/shared` and `@rstore/vue` for a new framework-agnostic `@rstore/multiplayer` package. Core keeps generic cache hook points and has no knowledge of clocks, timestamps, tombstones, text merging or presence. The new package also hosts a server-ordered rich-text OT engine. A downstream product needs it to replace Yjs.

## Problem

Collaboration features are spread over five packages. Core and Vue hard-code one merge policy.

- **Core runtime.**
  - `@rstore/core` exports a Hybrid Logical Clock (`src/hlc/*`), field-level LWW merge, text diff/merge/rebase (`src/crdt/*`) and a tombstone store with a GC timer (`src/tombstone.ts`).
  - The core store never calls any of them. Only `@rstore/vue`, `@rstore/nuxt-multiplayer` and `@rstore/nuxt-drizzle` import them.
- **Shared types.**
  - `@rstore/shared` defines the LWW types (`types/crdt.ts`) and the multiplayer wire protocol with its guards (`types/multiplayer.ts`, `utils/multiplayer.ts`).
  - The `Cache` contract has LWW-specific members: `writeItem({ fieldTimestamps })`, `deleteItem({ deletedAt })`, `readFieldTimestamps`, `writeFieldTimestamps`, `tombstones`, `gcTombstones` (`types/cache.ts`).
  - `ApplyMutationOptions` carries `fieldTimestamps` and `deletedAt` (`types/mutation.ts`), and the hook map has `cacheConflict` (`types/hooks/cache.ts`).
- **Vue cache.**
  - The LWW merge and tombstone checks are wired straight into the write path (`packages/vue/src/cache/writes.ts`: `writeItemNow`, `mergeTimestampedItem`), the delete queue (`queue.ts`), clear/clearCollection (`api.ts`) and SSR state (`api.ts#getState`, `hydration.ts#restoreCausality`).
  - `createStore({ tombstoneGc })` starts a timer in every client store, even when nothing ever sends a stamp (`cache/context.ts`).
- **Vue forms.** `$rebase` imports `mergeText` and `diffFields` from core (`packages/vue/src/form/rebase.ts`). Three-way text merge is the only merge policy, and it cannot be replaced.
- **Adapters.**
  - `@rstore/nuxt-multiplayer` holds Vue/Nuxt composables, plus framework-agnostic logic: peer bookkeeping, heartbeat, stale eviction, cursor rebasing, sanitization and guards.
  - `@rstore/nuxt-multiplayer-server` holds a transport-agnostic room registry, identity binding, rate limiter and origin check, all locked inside a Nuxt module.
- **No sequencing.**
  - The multiplayer `update` frame broadcasts whole field values with no version and no server order. Each peer rebases against whatever base it last saw.
  - Convergence is only exercised with two peers (`packages/playground/e2e/collab-*.spec.ts`).
  - Nothing supports rich text, marks, per-user undo or offline divergence.

The full inventory is in [01](./01-inventory.md).

Nothing above has shipped in a tagged release. The last tag is `v0.8.4` (2026-03-08). The op-log/CRDT work landed in `5705f33` (2026-03-11), HLC, tombstones and the server in `56c9615` (2026-05-02), and the Yjs plugin was removed in `6fa8546` (2026-06-23). Only nightly (`pkg.pr.new`) consumers are affected by the moves.

## Goals

1. `@rstore/core`, `@rstore/shared` and `@rstore/vue` contain no clock, timestamp, tombstone, text-merge, presence or protocol code.
2. Core exposes generic, documented extension points: opaque write metadata, write/delete interception, a namespaced item metadata store, form field mergers and a dispose hook. `@rstore/multiplayer` rebuilds today's behaviour on them with parity tests.
3. `@rstore/multiplayer` is framework-agnostic and depends only on `@rstore/shared`. It provides:
   - field LWW with HLC and tombstones, plus conflict policies
   - text diff, three-way merge and cursor rebase
   - presence, cursor and typing models
   - a transport-agnostic protocol
   - server room, identity and sequencing helpers
4. The Nuxt packages become thin adapters over `@rstore/multiplayer`.
5. New capability: server-ordered rich-text OT for block-node records ([04](./04-rich-text-ot.md)), validated by a spike with measurable exit criteria.

## Non-goals

- Peer-to-peer or server-less convergence. The OT engine requires a sequencing server, and LWW keeps working without one.
- A Yjs bridge or binary Yjs compatibility.
- A general JSON OT/CRDT. OT covers one node's inline content (text, marks, inline embeds) plus a fixed set of structural node ops.
- A Vue (non-Nuxt) composable layer in this series ([00 Q3](#open-questions)).
- Changing `@rstore/offline` persistence beyond persisting generic item metadata ([03](./03-package-layout.md#rstoreoffline-stays-separate-d8)).
- Relation operations broadcast. `plans/relation-operations-2026-09` keeps them serializable, so they can be added later.

## Design summary

```text
                       ┌──────────────────────── @rstore/multiplayer (deps: @rstore/shared) ───────────────────────┐
                       │ clock/  HLC            lww/  field LWW + tombstones + conflict policies   text/  diff/merge3/rebase │
                       │ presence/  peers, cursors, typing     protocol/  frames + guards + versions                  │
                       │ ot/  rich-text ops, transform, client state, undo   server/  rooms, identity, sequencer, ACL │
                       │ plugin: createMultiplayerPlugin() ── uses ──► core extension points ▼                         │
                       └────────────────────────────────────────────────────────────────────────────────────────────┘
@rstore/shared  CustomCacheWriteMetadata (augmentable) · cache hooks: cacheBeforeWriteItem / cacheBeforeDeleteItem
                · Cache.itemMetadata (namespaced, lifecycle 'item' | 'detached', serialized in getState)
                · formFieldMerge hook · dispose hook
@rstore/core    passes `metadata` opaquely: mutation options ─► finalize ─► cache.applyMutation
@rstore/vue     calls the hooks inside the queued write flush; stores/serializes item metadata; no merge policy
Adapters        @rstore/nuxt-multiplayer (composables/components) · @rstore/nuxt-multiplayer-server (Nitro handler)
                @rstore/nuxt-drizzle (stamps frames via multiplayer/clock, auto-installs the LWW plugin)
```

| Concept | Where | Role |
|---|---|---|
| `CustomCacheWriteMetadata` | `@rstore/shared`, augmentable | Opaque per-write data, such as `{ fieldTimestamps }` or `{ deletedAt }`, carried from mutations and connectors to cache hooks |
| `cacheBeforeWriteItem` / `cacheBeforeDeleteItem` | `@rstore/shared` hooks, sync | Replace the merged row, or skip the write/delete |
| `Cache.itemMetadata` | `@rstore/shared` contract, `@rstore/vue` impl | Per item, per namespace plugin storage, with lifecycle and SSR serialization |
| `formFieldMerge` | `@rstore/shared` hook, `@rstore/vue` call site | Replaceable per-field merge during `$rebase` |
| `createMultiplayerPlugin()` | `@rstore/multiplayer` | LWW, tombstones, `cacheConflict`, tombstone GC, text field merger |
| `@rstore/multiplayer/ot` | `@rstore/multiplayer` | Rich-text OT (Delta-like), client state machine, undo, composition guard |
| `@rstore/multiplayer/server` | `@rstore/multiplayer` | Rooms, identity, rate limit, origin, sequencer, op log interface, ACL hooks |

## Decisions

- **D1. One package with subpath exports** (`@rstore/multiplayer`, `/clock`, `/lww`, `/text`, `/presence`, `/protocol`, `/ot`, `/server`). Tree-shaking keeps client bundles small. One version to align.
  - Rejected: one package per concern. It means 7 packages to version for one feature set.
- **D2. `@rstore/multiplayer` depends only on `@rstore/shared`.**
  - It never imports `@rstore/core`, so core can re-export deprecated names from it for one minor without a dependency cycle ([05](./05-migration.md)).
  - Plugins use the `Plugin` type from shared.
- **D3. Generic hooks, not a merge-strategy registry in core.** Core does not model "merge". It offers interception (`setValue`/`skip`) and metadata. Policies live in plugins. This matches how `beforeCacheReadMany`/`setMarker` already work.
- **D4. Write metadata is opaque and augmentable.** `fieldTimestamps`/`deletedAt` become `metadata: { fieldTimestamps }` / `metadata: { deletedAt }`. `@rstore/multiplayer` augments `CustomCacheWriteMetadata`. Core warns in dev when a write carries metadata keys that no hook consumed ([02](./02-core-extension-points.md#d-unconsumed-metadata-warning)).
- **D5. Tombstones are multiplayer metadata** (namespace `multiplayer:tombstone`, lifecycle `detached`). Core has no notion of a "causal delete".
- **D6. Form rebase is policy-free by default.**
  - Without a merger, a field changed on both sides is a conflict.
  - The multiplayer plugin registers the three-way text merger, which restores today's behaviour.
  - `FieldConflict` used by forms is reduced to `{ field, localValue, remoteValue }` (`FormFieldConflict`). Forms filled the timestamps with `Date.now()`, so they carried no information.
- **D7. Nuxt packages stay as adapters.**
  - `@rstore/nuxt-multiplayer` keeps composables and components.
  - `@rstore/nuxt-multiplayer-server` keeps the module and h3/crossws wiring.
  - All logic moves into `@rstore/multiplayer`. They are not merged into one module: client and server deploy separately.
- **D8. `@rstore/offline` stays separate.** It gains generic item-metadata persistence and keeps write metadata on queued ops. It never imports `@rstore/multiplayer`.
- **D9. Rich text uses server-sequenced OT, not a CRDT** ([04](./04-rich-text-ot.md)).
  - Delta-style ops on one node's inline content. One sequencing stream per document (room). The server transforms incoming ops (ShareDB/ot.js model), with a reject-and-rebase fallback.
  - Node records stay plain rows, so they remain queryable in SQL.
- **D10. Generic utilities stay in core.** `fieldValuesEqual` and `diffFields` are generic object utilities (used by `mutation/optimistic.ts` and `form/state.ts`), so they move to `core/src/utils/` exports, not to multiplayer.

## Phases

Each slice is its own PR, written tests first. Details and gates are in [06](./06-slices.md).

| # | Slice | Depends on |
|---|---|---|
| S1 | Core extension points (metadata, hooks, item metadata store, dispose) | — |
| S2 | `@rstore/multiplayer` package: move pure modules plus deprecated re-exports | — |
| S3 | `createMultiplayerPlugin()` LWW and tombstones on S1 hooks, parity suites | S1, S2 |
| S4 | Remove the hard-wired LWW path from shared/vue (breaking) | S3 |
| S5 | `formFieldMerge` hook and text merger | S1, S2 |
| S6 | `@rstore/multiplayer/server` extraction, thin Nitro adapter | S2 |
| S7 | `@rstore/multiplayer/presence` channel core, thin Nuxt adapter | S2 |
| S8 | nuxt-drizzle and offline adoption | S3, S4 |
| S9 | Docs, skills, codemod | S4–S8 |
| X1 | Rich-text OT spike (parallel track) | S2 |
| X2 | OT productization (only if X1 passes) | X1, S6, S7 |

| File | Content |
|---|---|
| [01-inventory.md](./01-inventory.md) | Every feature, where it lives, who imports it, and its verdict |
| [02-core-extension-points.md](./02-core-extension-points.md) | Hooks, metadata, TS sketches, what leaves `@rstore/shared` |
| [03-package-layout.md](./03-package-layout.md) | `@rstore/multiplayer` tree and related-package decisions |
| [04-rich-text-ot.md](./04-rich-text-ot.md) | OT engine for block-node documents: algorithm, limits vs Yjs, spike |
| [05-migration.md](./05-migration.md) | Deprecations, re-exports, breaking changes, codemod, docs |
| [06-slices.md](./06-slices.md) | Ordered slices, tests first, exit gates, risks |

## Open questions

Each question has a recommended answer. Confirm or override before S1.

| # | Question | Recommended answer | Impact |
|---|---|---|---|
| Q1 | One package with subpaths or several packages? | One package with subpaths (D1) | [03](./03-package-layout.md) |
| Q2 | Merge `nuxt-multiplayer` and `nuxt-multiplayer-server`? | No. They deploy separately (D7) | [03](./03-package-layout.md) |
| Q3 | Ship Vue composables outside Nuxt (`@rstore/multiplayer/vue`)? | Not in this series. The framework-agnostic `createPresenceChannel` returns subscribe-able state. Add `/vue` on the first non-Nuxt consumer | S7 |
| Q4 | Keep text auto-merge in `$rebase` without the plugin? | No. Conflicts by default; the plugin restores the merge (D6). Listed as breaking | S5, [05](./05-migration.md) |
| Q5 | Keep LWW in core because nuxt-drizzle realtime depends on it? | No. `@rstore/nuxt-drizzle` auto-installs the plugin when realtime is on (`realtime.lww`, default `true`) | S8 |
| Q6 | Where do tombstone GC timers live? | In the plugin, stopped by the new `dispose` hook. `createStore({ tombstoneGc })` moves to `createMultiplayerPlugin({ tombstoneGc })` | S3 |
| Q7 | Text index unit for OT? | UTF-16 code units (ProseMirror/DOM positions). The server rejects ops that split a surrogate pair | [04](./04-rich-text-ot.md) |
| Q8 | Sequencing granularity: per node or per document? | Per document (room). Split/merge/move need cross-node transforms | [04](./04-rich-text-ot.md) |
| Q9 | Server transform (ShareDB) or reject-and-rebase (prosemirror-collab)? | Server transform. Rejection only when the base version is older than log retention | [04](./04-rich-text-ot.md) |
| Q10 | How are marks represented? | Inline Delta attributes on node `content`; embeds for inline nodes | [04](./04-rich-text-ot.md) |
| Q11 | Do OT edits go through core mutations? | No. A document channel writes cache rows with `metadata.otVersion`, pending ops sit in a cache layer, and the server sequencer persists rows | [04](./04-rich-text-ot.md) |
| Q12 | Which release? | S1–S9 in 0.9.0, after relation-operations PRs 1–3 merge (shared files). Shims removed in 0.10.0 | [05](./05-migration.md) |
| Q13 | Process-wide default HLC (`setDefaultClock`)? | A per-plugin clock on clients. The server helper keeps a process clock created by the adapter. No global setter in the public API | S2, S8 |

## Glossary

- **LWW:** last-writer-wins register per field, ordered by HLC.
- **HLC:** hybrid logical clock (Kulkarni et al., 2014). Serialized as `physicalHex:logicalHex:nodeId`.
- **Tombstone:** a record of a delete with its causal time, used to drop stale writes.
- **Write metadata:** opaque per-write data that core forwards to cache hooks without reading it.
- **Item metadata:** per-item plugin state that the cache stores beside the row, namespaced.
- **Node record:** one row per ProseMirror/Tiptap block node (stable `id`, `docId`, `parentId`, `orderKey`, `type`, `attrs`, `content`).
- **Sequencer:** the server component that assigns a total order (`version`) to ops in a document.
- **TP1:** the OT transformation property `apply(apply(S, a), T(b, a)) = apply(apply(S, b), T(a, b))`. TP2 is not needed with a central sequencer.
