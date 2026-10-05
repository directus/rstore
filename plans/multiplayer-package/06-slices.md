# 06: Implementation slices, gates and risks

Each slice is one PR. Tests are written first, fail for the right reason, then pass. Boundaries follow CONTRIBUTING "Test boundary and parity rules":

- Assert data, cache state and lifecycle, never private queues.
- Every new behavioural assertion gets an isolated fault-injection check: inject the defect in a scratch copy of the working tree, never in the shared checkout.

Checks for every PR: `pnpm run lint`, `pnpm test --project unit`, `pnpm test --project integration`, `pnpm test:types`. Slices that touch Nuxt packages also run `pnpm test --project nuxt` and `pnpm test:e2e` (playground collab specs).

## S1: Core extension points

`feat(shared,core,vue): cache write metadata, item metadata store and write hooks`

Scope: [02](./02-core-extension-points.md) A, B, C, D, F. **No behaviour change**: the old LWW path stays untouched beside the new hooks.

Tests first (`packages/vue/test/integration/cache/extension-points.spec.ts`, real store):

1. A `cacheBeforeWriteItem` handler's `setValue` result is what `peekFirst` returns, and relation indexes follow the replaced value (to-many relation read after a replaced FK).
2. `skip()` leaves state, markers and query data unchanged and emits no `afterCacheWrite`. Relation children of a skipped parent are not written.
3. Hooks run for `writeItem`, `writeItems` (per item, with per-item `metadata`), `applyMutation` results, relation children and frozen items.
4. Ordering under `pause()`/`resume()` and staggering: the hook sees `existing` equal to the state produced by the previous queued op.
5. `metadata` passed to `create`/`update`/`delete` and `mutate` reaches the hook unchanged, including the `createMany`/`updateMany` batch fallback.
6. `cacheBeforeDeleteItem.skip()` keeps the row.
7. Item metadata lifecycle:
   - `item` entries vanish on delete, eviction (GC), `clear` and `clearCollection`.
   - `detached` entries survive delete and eviction, and vanish on `clear`/`clearCollection`.
8. `getState()` → `setState()` round trip restores `serialize` namespaces, with numeric keys restored through `getKey` and string keys like `"01"` untouched. This ports the cases from `hydration.spec.ts`.
9. Dev warning for unconsumed metadata keys, exactly once per key.
10. The `dispose` hook fires once on `cache.dispose()`, even when called twice.

Exit gate:

- All existing suites pass unchanged.
- `pnpm --filter @rstore/vue benchmark:write-items`: median within +3% of `main` for 1 000 items, with no hook registered and with one no-op hook. The numbers go in the PR description.

### S1 implementation notes (2026-10-03)

- **R4 / Q12.** The relation-operations series has not landed: `feat/reworking-relation-ops` only holds its plan (`fd7f17f`, `plans/relation-operations-2026-09`). S1 is therefore strictly additive (the legacy `fieldTimestamps`/`deletedAt`/tombstone path is untouched) and expects to be rebased over relation-ops PRs 1–3 if they merge first.
- **Test files.** The ten cases are split by concern to stay under 300 lines: `vue/test/integration/cache/extension-points.spec.ts` (1–4, 6, plus "clearCollection is not intercepted"), `write-metadata.spec.ts` (5, 9) and `item-metadata.spec.ts` (7, 8, 10), with a shared fixture in `extensionPoints.ts`.
- **Item metadata keys follow row identity** (assumed): `1` and `'1'` address the same entry, like cache rows. `entries()` returns the stored key type, and `setState` recovers numeric keys through `getKey` (shared helper `resolveHydratedKey` with the legacy `restoreCausality`). This also keeps detached entries (future tombstones) reachable by a numeric key after hydration, where no row exists to recover the type.
- **Unregistered namespaces**: `write` throws; `setState` ignores payload namespaces that are not registered with `serialize` on the client (assumed).
- **Interception scope** (assumed): `cacheBeforeDeleteItem` runs for `deleteItem` and delete mutations only. Evictions (GC, prune, `clear`, `clearCollection`) are not interceptable; `clearCollection` marks its queued deletes `bypassHooks`.
- **`setValue` replaces the whole row** (not merged with `existing`); the last call wins, `skip()` wins over `setValue`. Frozen rows still bypass splitting and merging, but now run the hook and honour `setValue`.
- **Unconsumed-metadata warning** is once per key per cache (`createWarnOnce` in `@rstore/shared`, dev builds only via a literal `process.env.NODE_ENV` check).
- **Not in S1**: `beforeMutation`/`afterMutation` `metadata` + `setMetadata` (02 "What core does not get") is left to the slice that adds `plugin/stamping.ts`.
- **Hot path / R2.** `Hookable.hasHook` gates the payload; the committed row is read raw only when a handler exists; the payload object and its callbacks are allocated once per cache and refilled per write (dispatch is synchronous and not re-entrant). `benchmark:write-items` gained `RSTORE_BENCHMARK_BEFORE_WRITE_HOOK=1` (one no-op handler).
- **Benchmark gate.** The machine was loaded (load average 7–22), so separate-process runs were too noisy (MAD up to 1.5 ms). An in-process interleaved A/B (main vs S1 vs S1 + no-op hook, same `writeItems` + computed `peekMany` + sync watcher setup, 1 000 items, 3 × 300 alternating samples, pinned CPU) gave medians 2.14/2.09/2.15, 2.16/2.06/2.15 and 2.06/1.97/2.06 ms: S1/main 0.96–0.98, S1 + hook/main 1.00–1.005. Within +3%.

## S2: `@rstore/multiplayer` package, pure modules

`feat(multiplayer): new package with clock, lww, text, protocol`

Scope:

- `git mv` of `core/src/hlc/*`, `core/src/crdt/{fields,text*}.ts` (minus `diffFields`), `core/src/tombstone.ts`, `core/src/utils/nodeId.ts`, the `shared/src/utils/multiplayer.ts` runtime and `nuxt-multiplayer/.../sanitizeUpdate.ts`.
- Core deprecated re-exports ([05](./05-migration.md)). `diffFields` and `fieldValuesEqual` exported from `core/src/utils/`.
- Workspace wiring ([03](./03-package-layout.md#workspace-wiring)).

Tests first:

1. `packages/multiplayer/test/exports.spec.ts`: every subpath exports the expected names (written from the inventory list).
2. `packages/core/test/public-exports.spec.ts`: the deprecated names still resolve **and are the same function objects** as in `@rstore/multiplayer`, so there is no duplicate implementation.
3. Moved suites (`hlc`, `crdt`, `tombstone*`, `crdt-types.test-d`, `shared/test/utils/multiplayer`) run from their new location with unchanged assertions. Only imports change. The `git mv` keeps blame.
4. `parseMultiplayerMessage(raw, { onInvalid })` calls `onInvalid` for structurally invalid frames and not for non-JSON.

Exit gate:

- `@rstore/multiplayer` has no import of `@rstore/core`, `vue` or `nuxt` (an ESLint `no-restricted-imports` rule in `packages/multiplayer`).
- Core bundle size (unbuild output) does not grow; re-exports are tree-shaken.

### S2 implementation notes (2026-10-03)

- **No `git mv`**: staging is not allowed in this workflow, so files were moved with `mv`. Git detects the renames at commit time for files kept intact (`hlc.spec.ts`, `tombstone*.spec.ts`, the HLC, tombstone, text and guard sources). `core/test/crdt.spec.ts` (688 lines) was split by destination to respect the 300-line rule: `multiplayer/test/text/text.spec.ts`, `multiplayer/test/lww/fields.spec.ts`, `core/test/fields.spec.ts` (`diffFields`) and `shared/test/utils/equality.spec.ts`; the Temporal test doubles moved to `test/utils/temporal.ts`. Assertions are unchanged.
- **`fieldValuesEqual` lives in `@rstore/shared`** (deviation from D10): `mergeItemFields` needs it and multiplayer cannot import core (D2). Core re-exports the same function from `utils/`, so its public API is unchanged. `diffFields` stays in `core/src/utils/fields.ts`.
- **Deprecated core re-exports are the same objects, without runtime warning** (deviation from 05 "dev warning wrapper"): a wrapper cannot satisfy test 2 (identity) and cannot wrap the classes. Each name carries `@deprecated` JSDoc in `core/src/deprecated/multiplayer.ts`; the S9 codemod covers migration.
- **Protocol runtime left `@rstore/shared`** (06 scope over the 05 table): `shared/src/utils/multiplayer.ts` became `protocol/guards.ts`. Shared cannot re-export it (cycle), so `isMultiplayer*`/`parseMultiplayerMessage` are no longer exported by `@rstore/shared`; `@rstore/nuxt-multiplayer` and `@rstore/nuxt-multiplayer-server` now import `@rstore/multiplayer/protocol`. The types stay defined in shared for 0.9 with a file comment instead of per-symbol `@deprecated` (a per-symbol tag would also flag the multiplayer re-exports).
- **Q13 (assumed)**: `getDefaultClock`/`setDefaultClock` are still exported from `/clock` (nuxt-drizzle uses them until S8), with JSDoc steering to explicit clocks.
- **`maxStamp`** is exported from `/lww` (was the private `maxTimestamp` of `tombstone.ts`), ready for the S8 dedupe of nuxt-drizzle's `maxPayloadStamp`. `createNodeId` is exported from `/clock`.
- **Not moved yet**: `@rstore/vue` and `@rstore/nuxt-drizzle` keep importing the deprecated core names (no warning, same objects) until S4/S5/S8.
- **`version.ts` is not created**: no frame negotiation is specified yet; X1 adds the `collab:*` frames and their version helpers to `/protocol` (see the module doc in `protocol/index.ts`).
- **Gates**: the `no-restricted-imports` rule in `eslint.config.mjs` forbids `@rstore/*` (except shared), Vue and Nuxt in `packages/multiplayer/src`. Core dist shrank from 104 525 to 87 119 bytes (`index.mjs`), and an esbuild bundle of `createStoreCore` alone contains none of the moved code.
- **README**: `packages/multiplayer/README.md` is the root README like every package, because `copy-readme` overwrites package READMEs on release; the per-entry documentation is in the module comments of `src/**/index.ts` until S9 writes the real README.

## S3: Multiplayer cache plugin on the S1 hooks

`feat(multiplayer): createMultiplayerPlugin with field LWW and tombstones`

Scope:

- `plugin/{index,lww,tombstoneGc,augment,store}.ts`.
- Namespaces `multiplayer:fields` and `multiplayer:tombstone`.
- `cacheConflict` declared by augmentation.
- Conflict policies (`lww`, `local-wins`, `remote-wins`, function).

Tests first. These are parity suites; the old path is still present.

1. Parametrize `vue/test/integration/realtime-contract.spec.ts` and `vue/test/cache-tombstone-lifecycle.spec.ts` over `{ legacy: no plugin + old options, plugin: createMultiplayerPlugin() + metadata }`. Identical observable results.
2. New `packages/multiplayer/test/integration/plugin-lww.spec.ts`:
   - field merge,
   - an older stamp loses,
   - an equal stamp with a different value emits `cacheConflict` once with the correct payload,
   - each conflict policy,
   - the collection filter.
3. Tombstone GC timer: starts only on the client, honours options, stops on `dispose`, and never touches tombstones on item eviction (ported from `cache-tombstone-lifecycle`).
4. Writes without stamps on an item that has stamps keep the stored stamps (documents current behaviour, gap 1 in [01](./01-inventory.md#gaps-found-while-inventorying)).

Exit gate:

- The parity matrix is green.
- Fault injection: (a) skip the tombstone check, (b) drop `consume()`, (c) store merged stamps before the merge. Each fails at least one assertion.

### S3 implementation notes (2026-10-03)

- **Files.** `plugin/{index,lww,tombstoneGc,augment,store}.ts` and `lww/policies.ts` (`applyConflictPolicy`, exported from `/lww`). The root entry exports `createMultiplayerPlugin`, `getFieldTimestamps`, `setFieldTimestamps`, `getTombstone`, `tombstoneEntries`, `gcTombstones(store, cutoff)` and the namespace constants. No new subpath, so `package.json`/`build.config.ts` are unchanged.
- **Tombstones reuse `/lww`.** `createTombstoneView(cache)` (internal) is a `TombstoneStore` over the `multiplayer:tombstone` namespace (value `{ deletedAt }`), so `scheduleTombstoneGc` and the `/lww` `gcTombstones` run unchanged on cache data. The root `gcTombstones(store, cutoff)` shadows the `/lww` one by an explicit re-export.
- **Setup.** Namespaces are registered and the GC timer started in the `init` hook (it runs before `createStore` returns, so before an SSR `setState`). The timer is client-only (`store.$isServer`) and stopped by the `dispose` hook.
- **Conflict policies** (assumed semantics, they only apply to equal stamps with different values): `'lww'` keeps the stored value and emits `cacheConflict`; `'local-wins'` keeps it silently; `'remote-wins'` takes the incoming value silently; a function returns `'local'`, `'remote'`, `{ value }` or `undefined` (= `'lww'`).
- **`cacheConflict` timing** (deviation): it is emitted from the `cacheBeforeWriteItem` handler, i.e. before the merged row is stored (legacy: after), with `meta: {}` as before. There is no consumer in the repo.
- **Collection filter** (assumed): writes and deletes of unselected collections are left alone, and their stamps are not consumed, so the dev warning still names them.
- **Not in S3**: the `clock` option (only needed by `plugin/stamping.ts`) and `formTextMerge` (S5).
- **Parity matrix.** `test/utils/store/lwwModes.ts` describes the `legacy` and `plugin` legs; `FakeRemoteOptions.stampDelivery` makes the fake remote send stamps as cache arguments or as `metadata`. Parametrized: `vue/test/cache-tombstone-lifecycle.spec.ts`, `vue/test/integration/realtime-contract.spec.ts` and, additionally, the causality case of `vue/test/integration/hydration.spec.ts` (proves namespace registration before hydration). Test 3 (GC timer) is the plugin leg of the lifecycle suite rather than a copy in `plugin-lww.spec.ts`. Its "disabled" case was too weak in both legs (1 s of fake time never reached the default interval): it now advances past the default sweep.
- **Fault injection** (scratch copy): (a), (b) for writes and deletes, (c), plus 21 more (no `setValue`, merged/new-row stamps not stored, tombstone not cleared on resurrection, no `cacheConflict`, filter ignored, no tombstone, later tombstone overwritten, each policy branch, GC not stopped/on server/options ignored/disabled ignored/never started, namespaces not serialized, tombstone lifecycle `item`, fake remote ignoring `stampDelivery`). Each fails at least one assertion.

## S4: Remove the hard-wired path (breaking)

`feat(shared,vue)!: move LWW and tombstones out of the cache`

Scope:

- Delete `state.fieldTimestamps`, the tombstone store, `restoreCausality` specifics, the `tombstoneGc` runtime and `mergeTimestampedItem`.
- Remove the `Cache` members, keeping the deprecated aliases ([05](./05-migration.md)).
- Move `cacheConflict` out of shared.
- Port `test/utils/store/fakeRemoteRealtime.ts` to emit `metadata`.

Tests first:

1. Drop the `legacy` leg of the S3 parity matrix and keep the `plugin` leg.
2. Alias tests: `writeItem({ fieldTimestamps })` with the plugin still merges and warns once.
3. A store without the plugin with a stamped write: plain overwrite plus the unconsumed-metadata warning (breaking change 1, asserted).
4. `grep`-style guard test (`test/package-boundaries.spec.ts`): no `HLC`, `tombstone`, `fieldTimestamps` or `mergeText` identifiers in `packages/{core,shared,vue}/src`, except `core/src/deprecated/` and `vue/src/cache/deprecatedAliases.ts` (both deleted in 0.10). In 0.10 the exception list becomes empty.

Exit gate:

- The integration suites for hydration, GC eviction, pagination and component lifecycle pass with stamps migrated to `metadata`.
- Benchmark as in S1.

### S4 implementation notes (2026-10-03)

- **Removed from `@rstore/vue`**: `state.fieldTimestamps`, the tombstone store and timer, `restoreCausality` (only the generic `resolveHydratedKey` stays), `mergeTimestampedItem`, the `CustomCacheState.fieldTimestamps/tombstones` augmentation, and the internal `CreateCacheOptions.tombstoneGc/isServer`. `cacheConflict` is now declared only by `@rstore/multiplayer`.
- **Aliases** (05): `vue/src/cache/deprecatedAliases.ts` maps `writeItem({ fieldTimestamps })`, `deleteItem({ deletedAt })` and `applyMutation({ fieldTimestamps, deletedAt })` onto `metadata`, and serves `readFieldTimestamps`, `writeFieldTimestamps`, `tombstones` and `gcTombstones` from the plugin namespaces (`gcTombstones` compares with the deprecated `compareHLC` re-export of `@rstore/core`). Each warns once per cache. Their types live in `shared/src/types/deprecatedAliases.ts`, which keeps `CacheTombstone`/`CacheTombstones` as deprecated types (02 lists them as removed, but the `cache.tombstones` alias needs them). Core forwards the deprecated mutation options from `core/src/deprecated/mutationAliases.ts`.
- **`createStore({ tombstoneGc })`**: with a plugin named `rstore-multiplayer` registered, the store exposes the value as a non-enumerable `store.$deprecatedStoreOptions`, read by the plugin when its own `tombstoneGc` is unset; otherwise it is ignored. Both cases warn once.
- **Hook typing (R5)**: `createHooks()` in `@rstore/shared` got an explicit `ReturnType<typeof createHookable<HookDefinitions<…>>>` return type. The inferred type froze the hook names into a literal union in `dist/index.d.ts`, so `store.$hooks.callHookSync('cacheConflict', …)` failed to type-check against the built declarations. `multiplayer/test/plugin.test-d.ts` asserts the augmented name is accepted.
- **Guard test** (`test/package-boundaries.spec.ts`): it reads identifiers with the TypeScript scanner, so comments may still mention tombstones. Exceptions beyond the plan's two: `shared/src/types/crdt.ts` (the 0.9 type source, 05), `shared/src/types/deprecatedAliases.ts`, and `vue/src/form/rebase.ts` until S5 removes `mergeText` (S4 cannot meet the `mergeText` part of its own guard before S5).
- **Suites**: the S3 parity suites became plugin-only multiplayer suites (`multiplayer/test/integration/{tombstone-lifecycle,realtime-contract}.spec.ts`), per 01. The hydration causality case stays in vue with the plugin. `public-protocol`, `harness/realtime` and `eviction-coherence` install the plugin and use its helpers; the fake remote always sends `metadata` (frame field names unchanged); `tombstoneGc: false` was dropped from the stacks. New: `multiplayer/test/integration/deprecated-aliases.spec.ts` (test 2, plus `mutate` forwarding through core), `vue/test/integration/cache/without-multiplayer.spec.ts` (test 3, plus "no timer without the plugin").
- **Known gap until S8**: `@rstore/nuxt-drizzle`'s `plugin-realtime.ts` still calls the deprecated aliases and does not install the plugin, so its frames overwrite (with dev warnings) until S8.
- **Benchmark gate**: machine loaded (load 8–22). In-process interleaved A/B on Node 26.10 (`main` @ `c65c9f1` vs S4 vs S4 + one no-op `cacheBeforeWriteItem`, public `writeItems` of 1 000 items with a computed `peekMany` and a sync watcher, 3 × 300 rotating samples, pinned CPU): medians 2.06/1.96/2.06, 2.00/1.89/1.97, 2.00/1.89/1.97 ms; S4/main 0.944–0.951, S4 + hook/main 0.984–1.000. Within +3%.
- **Fault injection** (scratch copy, 17 faults): each alias unmapped, core not forwarding `mutate` aliases, alias warnings never/always, wrong namespace, inverted `gcTombstones` cutoff, wrong `tombstones.get`, store option not exposed/not read/not warned, unconsumed-metadata warning removed, a forbidden identifier in each of core/shared/vue `src`, and a no-op plugin. Each fails at least one assertion; the S3 faults still fail the moved suites.

## S5: Form field merge hook

`feat(vue,multiplayer)!: pluggable form rebase merge`

Scope: [02 E](./02-core-extension-points.md#e-form-field-merge-hook), `FormFieldConflict`, `plugin/formMerge.ts`.

Tests first (`vue/test/form/rebase-resolution.spec.ts` and a new `rebase-merge-hook.spec.ts`):

1. With no handler, non-overlapping text edits conflict.
2. With a handler, the merged value replaces local, the op log is rewritten per set op, and undo/redo replays the rebased ops (port the `collab-rebase` e2e intent to unit level).
3. The first handler that calls `setMerged` wins; later handlers are not consulted.
4. The `createFormObject({ fieldMerge })` standalone path.
5. With the multiplayer plugin, the existing text-merge cases are unchanged (parity with today's `rebase.ts` behaviour).

Exit gate: `playground/e2e/collab-rebase.spec.ts` and `collab-conflict.spec.ts` pass with the playground installing the plugin.

### S5 implementation notes (2026-10-03)

- **Types.** `@rstore/shared` gains `FormFieldConflict`, `FormFieldMergePayload` (`{ collection?, field, base, local, remote, setMerged }`) and `FormHookDefinitions.formFieldMerge` (payload `FormFieldMergePayload & { store }`). The standalone `createFormObject({ fieldMerge })` option takes the same payload without `store`. `$conflicts`/`$onConflict` use `FormFieldConflict`; `FieldConflict` stays the LWW type of `cacheConflict`.
- **Dispatch** (`vue/src/form/merge.ts`): the `fieldMerge` option wins when set; otherwise the form's store hooks are walked with `Hookable.callHookWith` and the walk stops at the first `setMerged`. The form `store` option type gained an optional `$hooks`. Core's plugin scope check reads `payload.collection?.scopeId`, since this payload's collection is optional.
- **Rebase** (`vue/src/form/rebase.ts`): no merge policy left. Both former `mergeText` calls go through `mergeField`: once for the field (previous base, form value, new base), then once per local `set` operation (previous base, operation value, new base) in `rebaseMergedFieldSetOps`. Steps are compared with `fieldValuesEqual` because merged values are no longer only strings. A field listed in `remoteChangedFields` whose remote value went back to the base is still a conflict without asking the mergers (unchanged rule). Conflicts lose the fake `Date.now()` timestamps (D6).
- **Plugin.** `plugin/formMerge.ts` exports `textFieldMerger` (root entry); `createMultiplayerPlugin({ formTextMerge })` (default `true`) registers it on `formFieldMerge`.
- **Tests.** Test 1 in `rebase-resolution.spec.ts`; tests 2–4 in `vue/test/form/rebase-merge-hook.spec.ts` (a numeric merger proves the rebase is policy-free; store hooks for test 3); test 5 is `rebase-text.spec.ts` with `fieldMerge: textFieldMerger` and `vue/test/integration/forms/rebase-workflows.spec.ts` with `createMultiplayerPlugin()`, assertions unchanged; `multiplayer/test/integration/plugin-form-merge.spec.ts` covers the registration and `formTextMerge: false`. The S4 guard exception for `vue/src/form/rebase.ts` is removed.
- **Playground.** `app/rstore/plugins/multiplayer.ts` registers `createMultiplayerPlugin()`, and `@rstore/multiplayer` is a playground dependency (lockfile via `pnpm install --ignore-scripts`). Without that file, `collab-rebase.spec.ts` "merges non-conflicting body edits…" fails (checked on a scratch copy of the playground).
- **Fault injection** (scratch copy, 12 faults): option ignored, hooks ignored, later handlers still called, per-operation rebase collapsed, per-operation merge with the wrong local value, merged value dropped, fake timestamps kept, text merger ignoring conflicts or never merging, `formTextMerge` ignored, no merger registered, `mergeText` back in vue `src`. Each fails at least one assertion.

## S6: Server extraction

`refactor(nuxt-multiplayer-server): delegate to @rstore/multiplayer/server`

Tests first:

1. Move the logic cases of `ws-handler.spec.ts`, `rooms.spec.ts`, `rateLimit.spec.ts`, `origin.spec.ts` and `guards.spec.ts` to `packages/multiplayer/test/server/` against `createMultiplayerServer` with a fake `RoomPeer`:
   - authorize once per room,
   - identity binding and anti-spoofing,
   - filter reject,
   - synthesized leave on close,
   - size and rate drops,
   - snapshot broadcast.
2. The adapter keeps only wiring tests: the h3 handler forwards text and close, `upgrade` rejects a foreign origin, the module template emits options.

Exit gate: `@rstore/nuxt-multiplayer-server` `src/runtime/server/` holds only `ws-handler.ts`, `handler-entry.ts` and the re-export facades.

### S6 implementation notes (2026-10-03)

- **Files.** `rooms.ts`, `identity.ts`, `rateLimit.ts` and `origin.ts` moved unchanged from `nuxt-multiplayer-server/src/runtime/server/` to `multiplayer/src/server/` (plain `mv`, no staging). New: `server/hooks.ts` (`createMultiplayerServerHooks<TPeer>()`, generic payload types) and `server/server.ts` (`createMultiplayerServer({ hooks, maxRoomSize, maxMessageBytes, rateLimit })` → `{ hooks, handleMessage(peer, text), handleClose(peerId) }`, same defaults as the module). They sit beside the X1 sequencer files in `server/index.ts`.
- **Peer contract** (assumed): `MultiplayerServerPeer { id, send(text: string) }`, text in and text out; the server serializes frames itself. A crossws `Peer` satisfies it, so hooks receive the transport peer unchanged (`peer.request` keeps working in `multiplayer.authorize`). The hook payload types are generic over the peer; the Nuxt adapter re-exports them specialized to crossws `Peer` under the old names (`MultiplayerAuthorizePayload`, `MultiplayerFilterPayload`, `MultiplayerServerHooks`).
- **Adapter.** `src/runtime/server/` holds `ws-handler.ts` (upgrade origin check and missing-authorize warning, then `handleMessage`/`handleClose`), `handler-entry.ts` and the facades `guards.ts`, `types.ts` and `hooks.ts` (the `rstoreMultiplayerServerHooks` singleton plus the type aliases). The module entry re-exports `Room`, `RoomRegistry`, `PeerIdentityStore`, `PeerRateLimiter` and `isOriginAllowed` from `@rstore/multiplayer/server`. Option defaults and the `#build` template moved to `src/options.ts` so the template is testable without booting Nuxt. `@rstore/shared` left the adapter's dependencies (unused).
- **Tests.** `multiplayer/test/server/{rooms,rateLimit,origin}.spec.ts` are the moved suites (imports only); `server.spec.ts` ports the identity cases of `ws-handler.spec.ts` and adds authorize once per room, reject/throw, re-authorize after leave, filter reject/throw/stamped frame, size/rate/capacity drops and invalid frames; `hooks.spec.ts` covers the registry. "Snapshot broadcast" stays a `Room` case (`rooms.spec.ts`): through `handleMessage` a join always lands after an `await`, so a server-level case could not fail. Adapter: `ws-handler.spec.ts` (forwarding, option forwarding, singleton hooks with the crossws peer, origin, warning), `module-options.spec.ts` (template emits defaults and options) and `facades.spec.ts` (re-exports are the `/server` and `/protocol` objects; replaces `guards.spec.ts`).
- **Build wiring.** `src/prosemirror` does not exist yet, so its entry was removed from `build.config.ts`, `package.json` `exports` and `typesVersions` (the build failed on the missing entry); X1 re-adds them with the folder. The source alias in `test/utils/sourceAliases.ts` is left in place (unused until then).
- **Fault injection** (scratch copy, 29 faults): authorize per frame, identity not stamped, authorize user id ignored, filter ignored/run before stamping/throw passes, throwing or rejected authorize joins, capacity ignored, no leave on close, membership kept on close or leave, size and rate limits ignored, echo to sender, hook unregister no-op, handlers not awaited, `hasHook` constant; adapter: own registry, each option not forwarded, close not forwarded, no origin check, repeated warning, template `rateLimit: false`/`allowedOrigins`/defaults wrong, facade replaced. Each fails at least one assertion.

## S7: Presence core

`refactor(nuxt-multiplayer): framework-agnostic presence channel`

Tests first (`packages/multiplayer/test/presence/*.spec.ts`, fake transport and injectable `now`):

1. A heartbeat is sent every `heartbeatMs` while open and on reopen.
2. Peers go stale after `staleMs`; leave removes them immediately; self-echo is filtered by `clientId`, and two tabs of the same user both appear.
3. Per-user aggregation picks the most recent connection.
4. Cursor rebase for local and peer cursors on a field text change (moved from the composable spec).
5. Typing: start, auto-expire after 3 s, cleared on blur and leave, no content field in frames (schema test).

The adapter specs (`useRstoreMultiplayerChannel.spec.ts` and the others) shrink to ref wiring and `onUnmounted` clean-up.

Exit gate: `playground/e2e/collab-presence.spec.ts` is green, and the composable is under 120 lines.

### S7 implementation notes (2026-10-03)

- **Core** (`multiplayer/src/presence/`): `channel.ts` (`createPresenceChannel({ roomId, transport, user, colors, clientId, heartbeatMs, staleMs, sweepMs, typingTimeoutMs, typingThrottleMs, now, onInvalidMessage })`), `peers.ts`, `cursor.ts` (moved from `nuxt-multiplayer/src/runtime/utils/multiplayerTextCursor.ts`), `typing.ts`, `user.ts`, `types.ts`. New subpath `@rstore/multiplayer/presence` (package exports, `typesVersions`, `build.config.ts`, source alias, `exports.spec.ts`).
- **Transport contract** (assumed): `{ send(text), isOpen?() }`; the owner feeds frames with `channel.receive(raw)` and announces (re)connections with `channel.handleOpen()`. State is a snapshot `{ peers, users, typing }` read with `getState()`/`subscribe()`; updates go to `onUpdate()` listeners; `dispose()` sends the leave and stops every timer.
- **Typing** (Q-free, assumed semantics): `multiplayer:typing { roomId, clientId, userId, target: { collection, key, field? } | null }`. Its types live in `@rstore/shared` `types/multiplayer.ts` beside the other frames, because the `MultiplayerMessage` union is defined there in 0.9 (re-exported by `/protocol`); the guard rejects any key outside that shape, so a frame cannot carry content. Local typing is announced at most once per `typingThrottleMs` (1 s) per target, a target change is sent at once, and blur/focus change sends `target: null` only while peers may still show the indicator. Remote indicators expire 3 s after their last frame and are cleared by `null` and by leave. The playground's own `/_ws` route does not relay typing frames (it is not the multiplayer server).
- **Adapter**: `useRstoreMultiplayerChannel` (94 lines) wraps the channel with `useWebSocket`, refs from `subscribe`/`onUpdate`, and disposes with `onScopeDispose` (also fires on component unmount, and makes the clean-up testable in an effect scope). New `typingPeers` ref, `notifyTyping`/`stopTyping`, and `useRstoreMultiplayerTyping(channel, target)` (`typingUsers`, `onInput`, `onBlur`). The channel interfaces moved to `runtime/types.ts` (re-exported by the composable). `messageGuards.ts` was removed (`isMultiplayerPeerStrict` is in `/presence`, the dev warning is the `onInvalidMessage` of the adapter); `validateMultiplayerMessage` is not kept as the wrapper 05 lists: it was never a public entry (breaking change 8). `normalizeSelectionDirection` and the duplicated cursor read are one `utils/selection.ts#readTextCursor`. Unused `@rstore/core`/`@rstore/shared` dependencies were dropped.
- **Bug fix needed for the gate**: `collab-presence.spec.ts` "settles to a single focus indicator after rapid title/body toggles" was flaky before S7 (1 of 2 runs failed on a scratch copy with the old composable) and failed 4/4 with the new one: the delayed blur of the title field cleared the focus the body field had taken meanwhile. `clearFocus(field?)` now ignores a blur of a field that no longer has the focus, and `useRstoreMultiplayerField` passes its field. With it, all 9 collab e2e specs pass and the presence spec passed 15/15 (`--repeat-each=3`).
- **Fault injection** (scratch copy, 50 faults): heartbeat while closed, no presence on reopen, no stale sweep, `staleMs` ignored, `lastSeen` not refreshed, leave ignored, self-echo by user id, no room filter, aggregation keeping the first connection, local cursor not rebased / re-sent when unchanged, peer cursors of every field, peer rebase not emitted, typing throttle off / never refreshed / target change throttled, blur always or never sending `null`, remote typing never expiring / not refreshed / ignoring `null` / kept on leave, typing guard accepting extra frame or target keys, unchecked target key or collection, typing frames rejected, dispose without leave or with the heartbeat running, focus change keeping the cursor, `onInvalidMessage` dropped, unsubscribe no-op, cursor affinity and direction; adapter: stale blur clearing, field hook without its field, no scope disposal, no presence on open, `isOpen` constant, heartbeat option dropped, state not subscribed, users from peers, `remoteUpdate` not set, warning in production or never, typing users not filtered, typing `onInput`/`onBlur` no-op, cursor direction or end fallback lost. Each fails at least one assertion.

## S8: Adopters

`feat(nuxt-drizzle,offline): adopt @rstore/multiplayer`

Tests first:

1. `nuxt-drizzle/test/plugin-realtime.test.ts`: frames are written with `metadata`. With `realtime.lww: false`, a stamped frame overwrites and warns.
2. The publish helper stamps with the adapter clock, not a global one (two Nitro instances in one process do not share a clock).
3. `offline` integration: item metadata in `persist` namespaces survives a reload. A queued update replays with its original `metadata`, and a stale realtime frame after reload loses to the persisted stamp (fixes gap 5).

Exit gate: `pnpm test --project nuxt` and `--project nuxt-boot` are green, and the playground-drizzle realtime e2e is green.

### S8 implementation notes (2026-10-03)

- **nuxt-drizzle client.** Frame application moved to `runtime/utils/realtime-apply.ts` (`applyRealtimeUpdate(store, update)`), which writes `metadata: { fieldTimestamps }` / `metadata: { deletedAt }` instead of the deprecated cache aliases; `plugin-realtime.ts` keeps the stamp tracking (`compareHLC` from `/clock`). `realtime-stamps.ts` uses `maxStamp` from `/lww` (the `maxPayloadStamp` duplicate is gone) and `parseHLC` from `/clock`; protocol types come from `@rstore/multiplayer`. `@rstore/multiplayer` is a dependency; nothing imports `@rstore/core` any more.
- **Option name** (deviation): the plan's `realtime.lww` is `ws.lww`, because nuxt-drizzle has no `realtime` option: realtime is configured by `ws`. Default `true`: the module writes `#build/rstore-drizzle-multiplayer-plugin.ts` (`createMultiplayerPlugin({ lww: true, formTextMerge: false })`) and registers it with `addPluginImport`, like `module/offline.ts`. Apps that register their own multiplayer plugin (for form text merge) must set `ws.lww: false`, since two instances would both run.
- **Server clock.** `server/utils/realtime-clock.ts` owns the instance clock (`installRstoreDrizzleRealtimeClock()`, called by `publish-hooks.ts`; `useRstoreDrizzleRealtimeClock()` creates it lazily for publishes outside the plugin). `setDefaultClock` is no longer called (Q13).
- **Core.** The `createItem`/`updateItem`/`deleteItem`/`createMany`/`updateMany`/`deleteMany` hook payloads carry the mutation's `metadata` (read-only), so storage plugins can queue it. This is the only core change; `beforeMutation`/`afterMutation` `setMetadata` (stamping) is still not done.
- **Item metadata contract.** `CacheItemMetadataNamespaceOptions.persist` (default `false`; part of the "same options" check of `register`) and `CacheItemMetadata.namespaces()`. `createMultiplayerPlugin()` registers both namespaces with `persist: true`.
- **Offline.** `plugin/itemMetadata.ts` mirrors the `persist` namespaces to an IndexedDB store `rstore-offline-item-metadata`, keyed `namespace:collection:key` with the original key in the value: after every cache write (`afterCacheWrite`) and in a microtask after every delete (`cacheBeforeDeleteItem`, so tombstones of rows that were never cached are kept too; such deletes emit no `afterCacheWrite`). Writes are chained in cache order. The entries are restored at the start of each store's first offline sync, before queue replay and the row load (assumed meaning of "loaded before the first cache read": the persisted rows themselves are only loaded by the sync), without overwriting entries already present (SSR). Frames applied before that first sync merge against no stamps. Queued operations keep `metadata` (left out when absent) and replay with it. A version change also clears the metadata store.
- **Tests.** `nuxt-drizzle/test/integration/realtime-apply.spec.ts` (test 1 at the data level, real store; the plan's `plugin-realtime.test.ts` keeps the stamp-helper unit cases), `nuxt-drizzle/test/module-realtime.test.ts` (option wiring), `nuxt-drizzle/test/realtime-clock.test.ts` (test 2), `offline/test/integration/item-metadata.spec.ts` (test 3, real store over `fake-indexeddb`, two "page loads" sharing the fake backend), plus a `namespaces()`/`persist` case in `vue/test/integration/cache/item-metadata.spec.ts`. The nuxt-drizzle integration suite is type-checked by the root `tsconfig.integration.json` (its stale exclude referred to a `tsconfig.integration.json` that does not exist) and excluded from the package `vue-tsc` run.
- **Gates.** `pnpm test --project nuxt` and `--project nuxt-boot` green; playground-drizzle e2e 10/10 (its app runs with `ws: true` and `offline: true`, so the auto-installed plugin and the persistence are both exercised).
- **Fault injection** (scratch copy, 22 faults): writes or deletes not persisted, delete persisted before the tombstone, removed entries kept, no restore, restore after replay and pull, queued metadata dropped, replay without metadata, core update hook without metadata, `persist` not resolved or not compared, multiplayer namespaces not persisted (fields, tombstones), drizzle apply dropping stamps or `deletedAt`, `ws.lww` ignored, plugin never installed, form merge enabled by the template, publish on the process clock, plugin installing the process clock, node id ignoring `RSTORE_DRIZZLE_NODE_ID`, clock recreated per publish. Each fails at least one assertion.

## S9: Docs, skills, codemod

Scope: [05](./05-migration.md) docs table, skills, codemod plus fixtures and their Vitest.

Exit gate:

- The docs build passes.
- Running the codemod on a copy of `packages/playground` yields a compiling app with no remaining deprecated imports.

### S9 implementation notes (2026-10-03)

- **Docs** (05 table): new `guide/data/collaboration.md` (plugin options, stamped writes, conflicts and `cacheConflict`, form text merge, presence, server), `plugins/nuxt-multiplayer.md`, `plugins/nuxt-multiplayer-server.md`, `guide/migration/v0_9.md`; updated `cache.md` (write metadata, item metadata incl. `persist`/`namespaces()`, SSR), `hooks.md` (`cacheBeforeWriteItem`, `cacheBeforeDeleteItem`, `formFieldMerge`, `dispose`, `metadata` on mutation hooks, `cacheConflict` stub), `form.md`, `live.md`, `offline.md`, `nuxt-drizzle.md` (`ws.lww`, concurrent edits, frame stamps); sidebar entries. No OT section (X2). `pnpm docs:build` passes (dead-link check included).
- **READMEs**: real READMEs for `multiplayer`, `nuxt-multiplayer`, `nuxt-multiplayer-server`, and `playground-ws-server` (generic pub/sub, does not route `multiplayer:*` frames, 03). `copy-readme` is now `scripts/copy-readme.mjs`, which skips those four; `test/copy-readme.spec.ts` checks that no package whose README differs from the root one is a target.
- **Codemod**: `scripts/codemods/multiplayer-0.9.yml` is generated by `generate-multiplayer-0.9.mjs` (the rules repeat the name lists many times); `test/codemods/multiplayer-0.9.spec.ts` runs it with the local `@ast-grep/cli` (new root dev dependency, catalog `^0.45.3`, so the test needs no network) on temp copies of `__fixtures__/*.input.ts` and compares with `*.output.ts`, checks every deprecated `@rstore/core` re-export is moved, and that the YAML is up to date with the generator. Deviations: the import split emits one import statement per moved name and leaves a trailing comma in the kept import (run `eslint --fix`), because ast-grep cannot group specifiers per destination in one pass; imports moving every name produce no empty import. `applyMutation({ fieldTimestamps | deletedAt })` is also rewritten. `createStore({ tombstoneGc })` becomes a `TODO` comment in place. The `localTimestamp`/`remoteTimestamp` rule only reports (it also matches `cacheConflict` entries, which keep them). Vue SFC script blocks are not scanned (ast-grep has no SFC support); documented in the migration guide. The fixture and lint ignore entries are in `eslint.config.mjs`.
- **Codemod gate**: run on a copy of `packages/playground`, it changes nothing (the playground already uses `@rstore/multiplayer`; no deprecated import or option is left, `.vue` files included by grep), so the copy compiles exactly like the playground build used by the e2e run. As a stronger check, it was run on the `HEAD` versions of `nuxt-drizzle` `plugin-realtime.ts`/`realtime-stamps.ts`/`publish-hooks.ts`, `vue` `form/rebase.ts` and `nuxt-multiplayer` `multiplayerTextCursor.ts`: every deprecated import and cache option was rewritten.
- **Skills**: regenerated incrementally from the updated docs (`rstore-vue`, `rstore-nuxt`, `rstore-nuxt-drizzle`) and a new `packages/multiplayer/skills/rstore-multiplayer`, per `SKILLS-GENERATION.md` (updated with the new scope and sources).
- **Fault injection** (scratch copy, 9 faults): codemod generator losing aliases, the shorthand option rewrite, the comma removal, a moved name, the guard moves, `deleteItem` coverage or the `import type` keyword; `copy-readme` without the multiplayer exclusion or without any exclusion. Each fails at least one assertion.

## X1 / X2: Rich-text OT

See [04](./04-rich-text-ot.md#spike-x1). X1 starts after S2 (it needs `/text`, `/protocol` and the package scaffold) and runs in parallel with S3–S9. X2 depends on S6 and S7.

### X1 implementation notes (2026-10-03)

Results, measurements and the go/no-go call are in [04a](./04a-spike-report.md). Deviations from [04](./04-rich-text-ot.md):

- **Entries.** The spike ships as experimental public entries (`/ot`, the sequencer in `/server`, `/prosemirror`) instead of unexported code, so the downstream product can integrate on X1. ProseMirror packages are optional peer dependencies of `@rstore/multiplayer`; installs showed no problem, so no separate `@rstore/prosemirror` (assumed).
- **Ops.** A ninth op, `setType` (paragraph to heading keeping the block id), LWW by server order. `splitNode` carries `parentId`, an explicit `newType`/`newAttrs` (never derived from state, which concurrent ops change) and an optional `keyRange`, used to re-key concurrent splits of one node so sibling order follows text order. A split may revive a deleted node (undo of a merge keeps the block id). `mergeNode` carries `at`, the target length, kept exact by transforms.
- **Sibling ties** are broken by `(orderKey, id)`: `version` changes on every edit, so `(orderKey, version, id)` would reorder siblings while someone types.
- **Conflicts.** Pairs that cannot both be kept (the same node merged into two targets, concurrent merges into one target, a restore racing a revival) raise `OtTransformConflict`; the sequencer rejects the later transaction with the new reason `conflict`, and its author predicts it (same transforms, same order). Validity that depends on state (move cycles) is decided by the sequencer only; the client shows pending ops that still apply and rebuilds after the answer.
- **Rejection is bisected by the client.** The sequencer stays all-or-nothing per transaction, but the client resubmits each half of a rejected multi-op transaction (offline sessions compose into one), so only the refused ops are rolled back. Unsent buffered ops that conflict with a remote op are dropped one by one.
- **Delete vs merge.** A merge sequenced after the deletion of its target revives the target; a deletion sequenced after the merge wins.
- **Protocol.** `collab:hello.protocols` lists the versions a client speaks; the server answers `collab:welcome { protocol, version }` before catch-up or snapshot (`version.ts`, `COLLAB_PROTOCOL_VERSION = 1`). Reject reasons add `conflict`, `protocol` and `unauthorized`.
- **Server (downstream requirements).** `sequenceTransaction(store, tx)` is stateless over a pluggable `OpLogStore` (`head`, `floor`, `range`, `findSubmission`, `loadNodes`, CAS `append`), with the pure `rebaseTransaction(tx, opsSince)`; resubmits are idempotent by `(clientId, seq)`; `submitServer(docId, ops, { baseVersion, clientId, seq })` sequences server-authored ops; ops touching only nodes hidden from a peer reach it as version-only `collab:ops` frames. Ops mixing hidden and visible nodes are sent unredacted (limitation, documented on the hook).
- **Undo** never hides a node that received another user's content, drops moves under hidden parents and merges into hidden nodes at undo time, and re-places a revived node whose parent was deleted.
- **Offline fallback** names conflict copies `<id>~conflict-<clientId>`; text typed offline in a node the server deleted also becomes a conflict copy.
- **Not done in X1:** the Yjs baseline (step 6), E9 (memory over 10 minutes), the E5 manual device matrix, and the cache integration (`multiplayer:ot` item metadata, row-frame dedupe), which belongs to X2 on top of S3.

### X2 implementation notes (2026-10-03)

`feat(multiplayer): productize collab documents (OT)`. Results of the remaining gates are in [04a, X2 follow-up](./04a-spike-report.md#x2-follow-up-2026-10-03). Deviations from [04](./04-rich-text-ot.md#productization-x2-only-after-go) and [03](./03-package-layout.md):

- **Entries stay as X1 shipped them** (`/ot`, `/server`, `/prosemirror`, experimental). The sequencer file keeps its X1 name `server/sequence.ts` (03 says `sequencer.ts`); `collabServer.ts` was split (`collabTypes.ts`, `collabSubscriptions.ts`, `collabHello.ts`, `redact.ts`, `redactRewrite.ts`) to stay under 300 lines.
- **Protocol 2** (`COLLAB_PROTOCOL_VERSION = 2`, version 1 still served): the hello opens a channel (`ch`, chosen by the client, unique per connection); after the welcome, frames carry `ch` instead of `docId`/`clientId`, and `collab:ops` names its author by a per-channel number (ids sent with the author's first frame). Clients send protocol 1 frames until the welcome, so they never send a channel frame to an old server. Codec: `toChannelFrame`/`fromChannelFrame`/`toChannelSubmit` in `/protocol`.
- **E8 Yjs criterion** (assumed reading): "within 2x of Yjs" is checked on what crosses the wire with `permessage-deflate` (context takeover, as browsers negotiate it): 1.1x / 0.9x. Raw JSON frames are ~5.3x a binary Yjs update and stay so; the docs tell deployers to enable `permessage-deflate` (off by default in `ws`). The baseline is the Yjs update size of the same keystroke trace on a y-prosemirror-shaped `Y.XmlFragment`, not a y-prosemirror browser run.
- **Op log retention.** `OpLogStore.compact?(docId)` is optional (stores written for X1 keep compiling). `sequenceTransaction` calls it every `compactEvery` versions (default 1000), so the policy is the sequencer's; the memory store no longer compacts inside `append`. `compactionFloor(log, retention)` is the shared retention rule. Compaction never deletes node rows, soft-deleted ones included (assumed: undo and late transactions may still address them; a purge would need a "deleted before floor" rule and is left out).
- **Redaction** (closes the X1 limitation): ops that mix hidden and visible nodes, or touch nodes the hook reduces, are replayed on the document before the entry (`SequenceResult.before`, the rows the sequencer already loads) and sent as the changes of the peer's view of each node (`insertNode`/`deleteNode`/`restoreNode`/`moveNode`/`setType`/`setAttrs`/`text` diff; an empty `setAttrs` touches a node whose view did not change, so versions stay equal). Because the server may transform a peer's concurrent edit differently (into a hidden node, or the peer moved it into a node a concurrent split created), `collab:ack` carries `nodes` (corrected records of every node the transaction or a concurrent entry touched) when the peer received rewritten ops since the transaction's base; the client takes them and drops buffered ops on those nodes (`rejected` with `conflict`). The rewrites list is kept per (document, client id), so it survives reconnects. Catch-up cannot rewrite (no past states), so with a `redact` hook a hello whose range needs rewriting, or contains the peer's own entries while it has unacknowledged rewrites, is answered with a snapshot after sequencing the pending transaction; `collab:snapshot.acked` tells the client its in-flight transaction is included (merge base = confirmed + in-flight). A remote op the client cannot apply (visibility changed) now triggers a resync instead of throwing.
- **Cache integration** (Q11 deviation): no `metadata.otVersion`; the version is read from the row's own `version` field. `createMultiplayerPlugin({ ot: { collections } })` registers the `multiplayer:ot` namespace (`{ docId, version }`, `item` lifecycle, persisted), drops writes whose `version` is not newer, consumes field stamps and excludes those collections from LWW. `bindCollabCache(store, client, { collection })` (root entry) commits confirmed rows and keeps pending ones in the `multiplayer-ot:<docId>` layer; the client gained the `confirmed` getter and event.
- **Drizzle store**: `createDrizzleOpLogStore({ db, tables, retention, now, isTransientError, onAppend })` at `@rstore/nuxt-drizzle/collab`, dialect-agnostic over Drizzle's query builder (tables passed by the app, columns by property name). CAS = head check in the transaction plus the `(docId, version)` unique key; SQLite `SQLITE_BUSY` is retried; WAL is required in practice (with a rollback journal a COMMIT fails while another libsql connection reads). `onAppend` publishes rows to non-collab realtime subscribers. Tested with libsql on a temporary file (libsql runs each transaction of `:memory:` on a new, empty connection). Not tested on Postgres/MySQL in this repository (no server in CI); the contract suite (`test/utils/collab/opLogStoreContract.ts`) is reusable for them.
- **Nuxt** (03 deviation): the server option is `collab: true | { maxMessageBytes, rateLimit }`, not `collab: { opLog }`: a store is a runtime object, so it is given to `defineRstoreCollab({ store, hooks, transform })` (server auto-import) from a Nitro plugin; `useRstoreCollabServer()` exposes `submitServer`. Collab frames get their own limits (1 MiB, 120/60 per s). Hooks receive `peer.ws` (crossws peer): `CollabServerHooks`/`createCollabServer` are now generic over the peer. Client: `useRstoreCollabDocument(docId, { collection, endpoint, clientId, transform })`; the server module publishes `runtimeConfig.public.rstoreMultiplayerEndpoint`. Offline persistence of pending edits is not wired in the composable (use `createCollabClient` with `savePendingState`).
- **Bug fix needed for the playground gate**: the S6 handler imported its options from `#build/…`, which Nitro refuses in server code (`[plugin impound] Vue app aliases are not allowed in server runtime`), so no app could build with the module. It is now a Nitro virtual module (`addServerTemplate`).
- **Playground**: `/doc/:id` (ProseMirror editor through `useRstoreCollabDocument`, block count read from the `DocNode` collection) and `e2e/collab-document.spec.ts`.
- **E5 manual matrix**: script in [04b](./04b-ime-manual-matrix.md) with a LAN test page (`node packages/multiplayer/e2e/manual-page.mjs`, `?manual`). Not run: the entries keep their "experimental" notes until it passes.
- **Server memory**: the per-document task queue of `createCollabServer` is dropped when idle (it grew with every document ever opened).
- **Still open after X2:** the E5 manual matrix ([04b](./04b-ime-manual-matrix.md)); the Drizzle store on Postgres/MySQL; pending-edit persistence in `useRstoreCollabDocument`; a y-prosemirror browser baseline (only update sizes were compared); purging soft-deleted nodes.

### X2 follow-up: undo anomalies of the snapshot merge fallback (2026-10-03)

`fix(multiplayer): keep other users' characters intact in the snapshot merge fallback`. The redaction fuzz found 2 undo violations in ~413 000 undos (seeds 545 and 134), both after a redacted client reloaded and merged its pending edits on a snapshot (`rebaseOnSnapshot`, also the history-truncation fallback):

- **Cause.** `mergeContent` matched characters of the base, local and server versions by plain-text diffs and gave a merged character the local marks whenever the local side had changed or inserted it. Equal characters are ambiguous: a character the client deleted and retyped (an emoji of another user replaced by its own) was taken for a format change of the other user's character, and an identical character the server added was taken for a local insert. The text op was then rebuilt with `diffDelta`, which turned the change into a `retain` with new marks: the other user's characters were re-labelled (author mark included), and one of them could be dropped.
- **Fix.** `rebaseOnSnapshot(base, local, snapshot, prefix, pending)` gets the pending ops (the client passes them): replaying the node's text ops gives the exact base origin of each local character (`ot/fallbackIdentity.ts`; nodes with a pending split or merge keep the diff). `mergeContent` attributes every merged character: a server character keeps the server marks, with the mark keys the local side changed on that same base character applied key by key (before, the local mark set replaced the server's); a local character typed in place of a base character it deleted stays local; a character only the local side has keeps its marks. The text op is built from that attribution (retain, format, delete, insert), never from a diff of the results. A merge that would drop a character the server added since the base is a conflict (conflict copy), like overlapping edits.
- **Tests** (`test/ot/fallback.spec.ts`, written first and failing): server-added characters keep their marks; local mark changes are applied key by key; a server-added character is never dropped; a local replacement is a delete + insert, not a re-labelling; a local format is a format; and the recorded seeds 134 and 545 (4 clients × 100 tx) have no undo violation.
- **Fault injection** (scratch copy, 6 faults): local marks replacing the server marks, a local insert taking over a server insert, the server-insert survival check removed, the pending ops not passed by the client, a replacement treated as a kept character, the origin replay ignoring retains. Each fails at least one assertion (the last one only after adding the format test).
- **Gates.** Redaction fuzz 2 000 runs (same scale): 0 divergence, 0 undo violations; E1/E4/E10 3 000 runs: 0 divergence, 0 undo violations; E6 at gate scale: 0 offline characters lost.

## Risks

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| R1 | **Silent degradation**: apps with stamps but no plugin overwrite and resurrect deleted rows | High / high | Unconsumed-metadata dev warning (D); nuxt-drizzle auto-install; breaking change 1 in migration docs |
| R2 | **Hot-path cost** of hooks in `writeItems` (1k-item publishes) | Medium / medium | Fast path without handlers; payload reuse per batch; S1 and S4 benchmark gate (+3%) |
| R3 | **Ordering bugs**: the hook sees the wrong `existing` under pause, staggering or layers | Medium / high | S1 tests 4 and 8; hooks see committed rows only (no layers), as today |
| R4 | **Merge conflicts with `plans/relation-operations-2026-09`**, which edits `mutation.ts`, `finalize/helpers.ts`, `cache/writes.ts` and the hooks | High / medium | Land S1 after relation-ops PRs 1–3 (Q12); keep S1 additive |
| R5 | **Augmentation fragility**: `CustomCacheWriteMetadata` and `cacheConflict` types missing when `@rstore/multiplayer` is not in the type graph | Medium / low | `@rstore/multiplayer` root import pulls in `augment.ts`; type tests in `test-d` |
| R6 | **Form behaviour change**: text auto-merge off by default | Medium / medium | Plugin restores it; docs and migration; conflicts surface in UI rather than corrupting text |
| R7 | **OT correctness**: transforms across 8 op types, split/merge cross-node, marks | High / high | Fuzz and property gates E1–E4; no-go path keeps Yjs for bodies |
| R8 | **Single-writer server per doc** limits horizontal scale and needs sticky routing | Medium / medium | Documented deployment (Durable Objects or sticky WS). `OpLogStore.append` is CAS-guarded, so a split brain is detected rather than silent |
| R9 | **Long offline beyond retention** loses automatic merge | Medium / medium | Conflict-copy fallback (E6); configurable retention |
| R10 | **IME across browsers** (Android, Safari) | High / medium | Composition hold plus one diff-based op; manual device matrix in E5 |
| R11 | **Scope creep**: OT drags the whole series | Medium / medium | X1 is time-boxed and parallel; S1–S9 ship without it |

## Rollback

- S1 is additive: revert freely.
- S2/S3 are additive with shims.
- S4/S5 are the breaking cut. If they slip, 0.9.0 ships S1–S3 and S6–S8 with the hard-wired path still present but deprecated, and S4/S5 move to 0.10.0.
