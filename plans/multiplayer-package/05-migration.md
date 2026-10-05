# 05: Migration, deprecations and docs

## Versioning

- **0.9.0**
  - Ships S1–S9.
  - `@rstore/multiplayer` is published as experimental (`<Badge text="Experimental" />` in docs).
  - Deprecated re-exports and option aliases keep nightly consumers working.
- **0.10.0**
  - Removes every 0.9 deprecation.
  - Moves the type definitions physically from `@rstore/shared` to `@rstore/multiplayer`.
  - `@rstore/core` drops its dependency on `@rstore/multiplayer`.
- **OT (X2)** ships when ready, as a minor of `@rstore/multiplayer` that adds the `/ot`, `/server` sequencer and `/prosemirror` entries. It is not tied to a core release.

None of the moved APIs is in a tagged release (last tag `v0.8.4`). The shims below exist only for nightly (`pkg.pr.new`) consumers, such as the downstream product and Monospace Studio. They are cheap, so they are kept for one minor as requested.

## Re-export strategy without cycles

| Package | 0.9.x | 0.10.0 |
|---|---|---|
| `@rstore/multiplayer` | Implementation for runtime code. Re-exports the type definitions that still live in `@rstore/shared` | Owns everything |
| `@rstore/core` | `dependencies: { "@rstore/multiplayer": "workspace:^" }`. `src/deprecated/multiplayer.ts` re-exports clock, LWW, text and tombstone helpers, each with `/** @deprecated Import from '@rstore/multiplayer/<subpath>'. Removed in 0.10. */` | File and dependency removed |
| `@rstore/shared` | Keeps `types/crdt.ts`, `types/multiplayer.ts` and `utils/multiplayer.ts` as the source, tagged `@deprecated` for direct import | Files deleted |

Runtime code is never duplicated: core re-exports, shared stays the single source of the types for one minor. There is no cycle, because multiplayer depends on shared and core depends on multiplayer.

- **Dev warning.** Each deprecated core export warns once on first call in dev builds (`[rstore] mergeItemFields from @rstore/core is deprecated; import from @rstore/multiplayer/lww`). The warning is done with a tiny wrapper, so the moved function body is not duplicated.
- **Exceptions.** `fieldValuesEqual` and `diffFields` stay in core (D10). Only their export path changes (`utils/` instead of `crdt/`), which is invisible to importers.

## Option and contract aliases (0.9.x)

| Old | New | Alias behaviour |
|---|---|---|
| `cache.writeItem({ fieldTimestamps })` | `cache.writeItem({ metadata: { fieldTimestamps } })` | Mapped by `vue/src/cache/deprecatedAliases.ts` before enqueue (called from `cache/api.ts`). Dev warning |
| `cache.deleteItem({ deletedAt })` | `cache.deleteItem({ metadata: { deletedAt } })` | Same |
| `ApplyMutationOptions.fieldTimestamps` / `.deletedAt` | `.metadata` | Mapped by the same file, called from `cache/mutations.ts`. Dev warning |
| `createStore({ tombstoneGc })` | `createMultiplayerPlugin({ tombstoneGc })` | If the multiplayer plugin is registered, it reads the store option when its own option is unset. Otherwise dev warning and ignored |
| `cache.readFieldTimestamps` / `writeFieldTimestamps` | `getFieldTimestamps(store, …)` / `setFieldTimestamps(store, …)` from `@rstore/multiplayer` | Thin methods over `itemMetadata` namespace `multiplayer:fields`. Dev warning |
| `cache.tombstones` / `gcTombstones` | `getTombstone(store, …)`, `tombstoneEntries(store)`, `gcTombstones(store, cutoff)` | Getter over the `multiplayer:tombstone` namespace. Dev warning |
| `useRstoreMultiplayerChannel` and friends | unchanged names | — |
| `@rstore/nuxt-multiplayer` `validateMultiplayerMessage` | `parseMultiplayerMessage(raw, { onInvalid })` | Kept as a wrapper. Dev warning |
| `@rstore/nuxt-multiplayer-server` exports (`Room`, `RoomRegistry`, `PeerIdentityStore`, `isOriginAllowed`, …) | Same names from `@rstore/multiplayer/server` | Re-exported from the module entry (already a re-export barrel) |

## Breaking changes (0.9.0)

These cannot be aliased.

1. **LWW and tombstones need the plugin.** Without `createMultiplayerPlugin()`:
   - stamped writes overwrite (no field merge),
   - `deletedAt` records no tombstone,
   - stale frames can resurrect deleted rows.

   `@rstore/nuxt-drizzle` installs the plugin automatically when realtime is on (`realtime.lww: false` opts out). A dev warning names unhandled metadata keys ([02 D](./02-core-extension-points.md#d-unconsumed-metadata-warning)).
2. **Form `$rebase` text auto-merge needs the plugin.** With no `formFieldMerge` handler, a field changed both locally and remotely is a conflict, even when the text edits do not overlap.
3. **`$conflicts` element type.** It becomes `FormFieldConflict { field, localValue, remoteValue }`. `localTimestamp`/`remoteTimestamp` are removed (they were `Date.now()`).
4. **`cacheConflict` hook typing.** It exists only when `@rstore/multiplayer` types are loaded (augmentation). Untyped `hook('cacheConflict', …)` calls without the package fail type-checking.
5. **SSR payload.** `CustomCacheState.fieldTimestamps` and `.tombstones` are replaced by `itemMetadata`. Code that reads `getState()` directly must update. Same-build hydration needs no change.
6. **Tombstone GC timer.** No timer runs unless the plugin is installed. Stores without the plugin lose the 60 s interval, which is the intended fix.
7. **`Cache` implementers.** Custom `Cache` implementations, if any outside `@rstore/vue`, must implement `itemMetadata` and call the two new hooks.
8. **`@rstore/nuxt-multiplayer` util paths.** The runtime `utils/*` files move. They were not a public entry, so only deep imports break.

## Codemod

`scripts/codemods/multiplayer-0.9.yml`, ast-grep rules run with `pnpm dlx @ast-grep/cli scan -r scripts/codemods/multiplayer-0.9.yml --update-all`:

| Rule | Rewrite |
|---|---|
| `import { $$$A } from '@rstore/core'` containing clock/LWW/text/tombstone names | Split the import: those names go to `@rstore/multiplayer/{clock,lww,text}`, the rest stay. Name list generated from `packages/multiplayer/src/*/index.ts` |
| `import type { $$$A } from '@rstore/shared'` containing `FieldTimestamp*`, `FieldConflict`, `MergeResult`, `Text*`, `Multiplayer*` | Move to `@rstore/multiplayer` |
| `$C.writeItem({ $$$, fieldTimestamps: $T, $$$ })` | `metadata: { fieldTimestamps: $T }` |
| `$C.deleteItem({ $$$, deletedAt: $T, $$$ })` | `metadata: { deletedAt: $T }` |
| `createStore({ $$$, tombstoneGc: $X, $$$ })` | Remove the option and print a TODO to pass it to `createMultiplayerPlugin` (not automatic: plugin lists vary) |
| `.localTimestamp` / `.remoteTimestamp` on `$conflicts` items | Report only |

Testing the codemod:

- Fixture files under `scripts/codemods/__fixtures__/` (before/after).
- One Vitest that runs ast-grep on a temp copy and diffs the result. Run it on the playground before S9 lands.

## Docs

| File | Change |
|---|---|
| `docs/guide/data/collaboration.md` (new) | Overview: when to use LWW, form rebase or OT. `createMultiplayerPlugin` options, conflicts, tombstones and GC, presence channel, typing, server module. OT section after X2 |
| `docs/guide/data/cache.md` | Write `metadata`, the `itemMetadata` API and namespaces, SSR serialization |
| `docs/guide/plugin/hooks.md` | Add `cacheBeforeWriteItem`, `cacheBeforeDeleteItem`, `formFieldMerge`, `dispose`. Move `cacheConflict` to the collaboration page (keep a stub link) |
| `docs/guide/data/form.md` | `$rebase` policy: default conflicts; text merge via plugin; `FormFieldConflict` |
| `docs/guide/data/live.md` | Link to collaboration for stamped frames |
| `docs/guide/data/offline.md` | Persisted item metadata. Replace "Conflicts are application-specific" with the LWW/OT options |
| `docs/plugins/nuxt-drizzle.md` | `realtime.lww` option. Stamps go through `metadata` |
| `docs/plugins/nuxt-multiplayer.md` (new) | Composables, components, endpoint config |
| `docs/plugins/nuxt-multiplayer-server.md` (new) | Module options, hooks, origin, identity, rate limits |
| `docs/guide/migration/v0_9.md` (new or existing) | Breaking changes above plus the codemod command |
| `docs/.vitepress/config.mts` | Sidebar entries for the new pages |
| `packages/{multiplayer,nuxt-multiplayer,nuxt-multiplayer-server}/README.md` | Real READMEs. All three are currently the generic repo README |

## Skills

Regenerate from the updated docs only, following `SKILLS-GENERATION.md`:

- `packages/vue/skills/rstore-vue`
- `packages/nuxt/skills/rstore-nuxt`
- `packages/nuxt-drizzle/skills/rstore-nuxt-drizzle`
- new `packages/multiplayer/skills/rstore-multiplayer`

## Consumer validation

Before 0.9.0, on a `pkg.pr.new` build:

- **Playground.** The collab editor and all `playground/e2e/collab-*.spec.ts` pass with imports switched.
- **Downstream product.** It boots with `createMultiplayerPlugin()` and its realtime suite passes.
- **Monospace Studio.** No type errors (it does not use multiplayer, so this checks that core and shared type changes leak nothing).

## Implementation notes (S2, 2026-10-03)

- **No runtime deprecation warnings.** The deprecated `@rstore/core` names are the very objects exported by `@rstore/multiplayer` (asserted by `core/test/public-exports.spec.ts`), so they carry `@deprecated` JSDoc only. The S9 codemod rewrites the imports.
- **Additional removal without alias.** `@rstore/shared` no longer exports the protocol guards (`isMultiplayerId`, `isMultiplayerTextCursor`, `isMultiplayerUser`, `isMultiplayerMessage`, `parseMultiplayerMessage`): the runtime moved to `@rstore/multiplayer/protocol` and shared cannot re-export it without a dependency cycle. Only the protocol and LWW *types* stay defined in `@rstore/shared` during 0.9. The codemod's `@rstore/shared` rule should cover these value imports too.
- **`fieldValuesEqual`** is implemented in `@rstore/shared` and re-exported unchanged by `@rstore/core` (same function), because `@rstore/multiplayer` needs it and cannot import core.

## Implementation notes (S4, 2026-10-03)

- **`CacheTombstone` / `CacheTombstones` stay as deprecated types** in `@rstore/shared` (`types/deprecatedAliases.ts`) because the `cache.tombstones` alias returns them. They go with the aliases in 0.10.
- **`createStore({ tombstoneGc })` alias**: the Vue store passes the value to the plugin through a non-enumerable `store.$deprecatedStoreOptions` property, only when a plugin named `rstore-multiplayer` is registered. It warns once in both cases.
- **Alias warnings** are once per cache and alias (`[rstore] cache.writeItem({ fieldTimestamps }) is deprecated and removed in 0.10; use metadata: { fieldTimestamps } with createMultiplayerPlugin() from @rstore/multiplayer`). A stamped alias without the plugin also triggers the unconsumed-metadata warning (breaking change 1).

## Implementation notes (S6–S9, 2026-10-03)

- **`validateMultiplayerMessage` is not kept as a wrapper** (deviation from the alias table): it lived in `@rstore/nuxt-multiplayer` `runtime/utils`, which was never a public entry (breaking change 8). The adapter passes a dev warning as `onInvalidMessage` of the presence channel.
- **`realtime.lww` is `ws.lww`** in `@rstore/nuxt-drizzle`: the module has no `realtime` option, realtime is configured by `ws`.
- **Codemod output**: moved names get one import statement each and the kept import keeps a trailing comma; the migration guide tells users to run their formatter. `.vue` files are not scanned.
- **Docs**: the 0.9 migration guide is `docs/guide/migration/v0_9.md` (new page).
