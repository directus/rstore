# S04: result ordering

- Status: verified; implemented in the working tree on 2026-10-23.
- Depends on: S02.
- Owner: rejecting page results older than the one shown.
- Contract: [overview](./00-overview.md).

## Outcome

Fetched and pushed page results can carry a version, such as a transaction id, an LSN or an HLC stamp. A page never replaces a result with one carrying an older version, whatever order the responses arrive in.

`requestId` superseding only orders requests by when they started. Versions order results by the server state they reflect: a fetch started before a push can still answer with newer data, and a push can describe older data than a fetch in flight.

## API

- Fetch hooks set `meta.$resultVersion` (`FieldTimestampValue`) on the fetch meta they receive.
- `setResult(result, { version })` passes it for pushes.
- Comparison uses `compareHLC` from `@rstore/core`. It already orders `number | string` stamps for field timestamps; keep one comparator.
- Results without a version are always applied, as today.

## Semantics

1. Each page keeps a private `_resultVersion`, set when a result is applied.
2. In `setPageResult` and the S02 publish path, a result whose version compares lower than `_resultVersion` is dropped:
   - its tracking is collected like a superseded fetch;
   - the push path returns `stale`;
   - a stale fetch still settles its lane as complete, because the page holds a result at least as new.
3. Equal versions apply. That makes a push echoing the state of a just-landed fetch a no-op in effect.
4. `refresh()` doesn't reset `_resultVersion`. An options change creates new pages and therefore new versions.
5. Meta from a stale result is not applied.

## Files

- `packages/vue/src/query/page.ts`: version check in the shared publishing path.
- `packages/vue/src/query/load.ts`: read `$resultVersion` from fetch meta, and strip it from published meta like `$canPublishQuery`.
- `packages/vue/src/query/types.ts`: private page field.
- `packages/shared/src/types/hooks/meta.ts`: document `$resultVersion` on `CustomHookMeta`.
- Tests: extend `pushed-results.spec.ts`.

## Tests first

- A push with version 5, then a fetch answering with version 4: the push result stays and the stale fetch's rows are collected.
- A fetch with version 5, then a push with version 4: `setResult` returns `stale` and the page is unchanged.
- Unversioned results keep current behavior (existing suites unchanged).
- HLC string stamps order like the existing field-timestamp tests.

## Exit gate

Focused and full suites pass; docs describe versioning for connector authors.

## Implementation receipt

- Status: verified; implementation and acceptance gates completed on 2026-10-23. No staging, commit or push. Existing S01–S03 and unrelated working changes preserved.
- Changed files:
  - `packages/shared/src/types/hooks/{meta,realtime}.ts`: typed/documented fetch `$resultVersion` and push `SetResultOptions.version`, both `FieldTimestampValue`.
  - `packages/vue/src/query/{page,result,load,types}.ts`: private per-page version and shared `compareHLC` rejection; fetch/background versions participate in publication guards before cache writes, are checked again after main-page waits, and stay out of public metadata. Rejected fetches collect unreconciled tracking and settle their loading lane successfully.
  - New `packages/vue/src/query/push.ts`: existing S02 publisher extracted from `page.ts` to keep sources below 300 lines. Rejects stale pushes before side effects; rechecks queued delivery. Versioned pushes complete lanes while allowing an already-started fetch to publish a newer snapshot. Unversioned pushes keep request supersession.
  - `packages/vue/src/query/createQuery.ts` and `packages/vue/src/api/livePages.ts`: forward push versions through the actual page adapter. Refresh retains versions; base option resets clear the reused main page's version (this implementation retains that object rather than creating a new main page).
  - `packages/core/src/query/dedupe.ts`: required cross-package ordering prerequisite. Each pending consumer reads the shared response version before cache publication guards run, then receives its completed version separately from private ownership metadata. Ordinary metadata and tracking ownership retain their existing behavior.
  - New `packages/vue/test/integration/query/pushed-results-ordering.spec.ts`: 12 real-store/cache scenarios cover both race directions, same-key fields, stale-row collection, stale metadata, numeric/equal/zero/unversioned versions, HLC logical/node/mixed ordering, page isolation, option resets, deduped cache-write guards, and foreground/background version fan-out. Uses FakeRemote only for server replies.
  - `packages/vue/test/integration/query/pushed-results.spec.ts` and new `pushed-results.utils.ts`: moved existing setup, subscription wait and connector cache-write helpers without changing the existing scenarios; reused by the ordering suite. Source/test files remain below 300 lines.
  - `packages/vue/test/query-public-api.test-d.ts`: numeric/HLC versions accepted; invalid object version rejected; fetch metadata version typed.
  - `docs/guide/data/live.md`, `docs/guide/plugin/hooks.md`: fetch/push API, comparator format, stale/equal/unversioned behavior, refresh/options lifecycle, metadata privacy and item timestamp boundaries.
  - `packages/vue/skills/rstore-vue/{SKILL.md,references/api-live-query.md,references/api-query.md}` and `SKILLS-GENERATION.md`: documentation-derived incremental sync. Dependency copies remain generated by sync-skills/prepack; README has no duplicated ordering reference.
  - This plan: Status and implementation receipt.
- Failing-first evidence:
  - Before implementation, `pnpm exec vitest run --project integration packages/vue/test/integration/query/pushed-results-ordering.spec.ts`: **8 failed, 1 passed**. Stale pushes returned `applied`, HLC ordering was absent, and an in-flight fetch carrying newer version 6 was discarded after push 5. Log: `/tmp/rstore-s04-failing-first.log`.
  - Added the same-key/pre-cache-write race before implementation: **9 failed, 2 passed**, including fetch 6 failing to replace pushed fields. Log: `/tmp/rstore-s04-failing-first-final.log`.
  - Additional deduped-cache-write regression failed before its fix: two consumers accepted push 5, but late fetch 4 changed their shared row title from `Pushed one` to `One`. Forwarding the live response version to every pending consumer's guard fixes this. Log: `/tmp/rstore-s04-dedupe-red.log`.
  - Initial focused run after implementation exposed the existing queued non-main publication contract: callbacks acknowledge acceptance synchronously, with delivery after the main-page promise. The page-isolation test now observes delivered data before checking rejection against that version; no production contract was weakened. Log: `/tmp/rstore-s04-first-green.log`.
- Commands and results:
  - Used installed Node **26.2.0** on `PATH` and standalone pnpm. pnpm's embedded Node 20 emits engine warnings; child Node commands use installed Node 26.
  - `pnpm exec vitest run --project unit packages/core/test/hlc.spec.ts packages/vue/test/public-exports.spec.ts`: **2 files / 33 tests passed**. Log: `/tmp/rstore-s04-unit.log`.
  - `pnpm exec vitest run --project integration packages/vue/test/integration/query/pushed-results-ordering.spec.ts packages/vue/test/integration/query/pushed-results.spec.ts packages/vue/test/integration/query/live-pages.spec.ts packages/vue/test/integration/subscriptions.spec.ts packages/vue/test/integration/query/pagination-results.spec.ts packages/vue/test/integration/query/mixed-policy-pagination.spec.ts`: **6 files / 68 tests passed**. Log: `/tmp/rstore-s04-focused-final.log`.
  - Initial `pnpm test:types` found stale built Shared declarations missing `$resultVersion`. `pnpm --filter @rstore/shared build`, `pnpm --filter @rstore/core build`, `pnpm --filter @rstore/vue build`: **passed**. Logs: `/tmp/rstore-s04-build-{shared,core,vue}.log`.
  - Final `pnpm test:types`: **passed**, including workspace packages and root integration/browser types. Log: `/tmp/rstore-s04-types-final.log`.
  - `pnpm exec eslint` on all slice-changed source/test/guide files and `SKILLS-GENERATION.md`: **passed** after import order and trailing-blank-line fixes. Log: `/tmp/rstore-s04-lint-final.log`. Explicit `pnpm exec eslint --no-ignore` on the three changed canonical skill files: **passed**. Log: `/tmp/rstore-s04-skills-lint.log`.
  - `pnpm docs:build` outside sandbox: **passed**, including page rendering. Existing Tailwind plugin and chunk-size warnings remain. Log: `/tmp/rstore-s04-docs.log`.
  - Full `pnpm test` outside sandbox: **287 files / 2,101 tests passed; 1 file / 4 tests conditionally skipped**. Log: `/tmp/rstore-s04-full.log`.
  - `pnpm exec eslint plans/live-query-results/04-result-ordering.md`: **passed**. Log: `/tmp/rstore-s04-receipt-lint.log`.
  - `git diff --check`: **passed**. Final source/test review found no duplicated helper implementation or presentation assertions; no unrelated changes reverted or reformatted.
- Limitations / follow-ups:
  - Real Vue/store/cache/query behavior is covered against the shared stateful fake remote; external connector interoperability is not claimed.
  - Versions use numeric or serialized HLC stamps accepted by `compareHLC`; arbitrary transaction-ID/LSN strings require connector encoding into that format.
  - Unversioned applied results clear the page's version, so mixed versioned/unversioned transports cannot claim continuous monotonic snapshot ordering. Supply versions consistently when that guarantee is needed.
  - Page versions do not replace field timestamps or tombstones and cannot undo connector cache writes made before a stale push is rejected. Offset-window design and result confirmation remain S06/S05.
  - Four distribution tests require `RSTORE_DISTRIBUTION_ROOT` / `RSTORE_DISTRIBUTION_PEERS_ROOT` and remain skipped in the default suite. No requested command was left unrun; no S04 blocker remains.

## Review fixes

- `query/version.ts` validates versions: `setResult` throws a `TypeError` for anything but a finite number or a serialized HLC string; an invalid fetch `$resultVersion` warns once and counts as unversioned.
- `markVersionedPush`: an unversioned fetch already in flight when a versioned push is accepted is dropped as stale, cache writes included; later fetches apply.
- A queued versioned push reserves its version before the main-page wait, so a lower-version fetch cannot overwrite the connector's pushed fields meanwhile.
- Out of plan, kept for a separate decision: Core `dedupe.ts` metadata accessors linking `$resultVersion` across deduped consumers, and the module-level `WeakMap` side tables.
- Cleanup: `$resultVersion` docs say connectors set it and rstore removes it from published metadata; `SetResultOptions.meta` no longer accepts it.
