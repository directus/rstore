# S12: Monospace adoption of S08–S11

- Status: implemented and verified (2026-10-26).
- Depends on: [S08](./08-subscribe-payload.md)–[S11](./11-ended-live-queries.md) released on a pkg.pr.new build pinned in `directus-next`.
- Owner: `packages/studio/app/rstore/plugins/3.realtime.ts` and `useItems`/`useItem` in `directus-next`.

## Outcome

The Studio realtime plugin shrinks to the collection guard, the REST query string, `client.subscribe`, and one `setResult(rows, { meta })` per push. Behavior stays "exactly the same as today, but with live updates".

## Changes

- S08: drop `store.$resolveFindOptions` and `readOptionsKey`; use `findOptions` and `key` from the payload.
- S09: drop the plugin's cache-write loop; let `setResult` write the rows.
- S10: resolved server-read comparison excludes client-only options; re-check whether the "follow no pages while typing" selection in `useItems` is still needed.
- S11: forward engine `kickedOut` to `end({ retry: true })`.
- Update the S07 known limitations accordingly.

## Tests

- Existing plugin, client, `useItems` and e2e (`packages/testing/e2e/tests/realtime/live-lists.spec.ts`) tests pass unchanged in behavior.
- New: a kicked-out live query re-subscribes; a rejected push writes nothing to the cache.

## Exit gate

Studio typecheck, lint, unit suite, the realtime e2e spec.

## Implementation receipt

- Studio consumes the pinned S08–S11 APIs directly. `3.realtime.ts` uses payload `findOptions`/`key`, removes local option resolution and key extraction, and delegates accepted row parsing/writes to `setResult`. Plugin shrinks from **118 to 77 lines**. Existing response normalization remains shared with fetch hooks: collection envelope parsing, nested relation unwrapping, pagination sentinel trimming and total-count inference run before rstore's item parsing, exactly as with REST.
- Keyed null publication deletes the cached item only after `setResult(null)` accepts it; inactive callbacks cannot delete another consumer's cached row. Client `onEnded` already covers both `kickedOut` and refused reconnect joins; the plugin forwards its reason to `end({ reason, retry: true })`. Client/protocol and UI need no new API.
- Plain `subscribe()` has neither `setResult` nor `end`. `useItem` now owns a cache-only keyed `liveQuery` in the existing collection-following scope, preserving its explicit REST load, selection, loading/error behavior and cache-backed item. No duplicate REST request. A separate plain keyed subscription regression verifies resolved defaults and one non-idempotent resolution transform still produce exactly the keyed fetch's query string.
- Keep `useItems`' empty page selection during unsettled typing: it still uses the unthrottled search, so its resolved server read changes per keystroke even though S10 ignores `fetchPolicy`. Existing rapid-typing regression checks no extra joins/REST reads and a usable settled push. Comment now states this reason.
- Update relation test fixture to the installed rstore `NormalizedRelationTarget` shape, dropping obsolete `indexKey`/`indexFields`. No transport logic or rstore source changed.
- Tests use real rstore queries, cache, parsing hooks, Studio plugins and realtime client, with existing fake socket/REST transport only. Recovery controls rstore's backoff with fake timers; no owned logic is mocked. Cleanup stops scopes, aborts sockets, disposes cache and restores timers.
- Failing-first: `pnpm --filter @monospace/studio test:unit --run app/rstore/plugins/__tests__/3.realtime.test.ts` produced **4 failed / 6 passed**, `/tmp/monospace-s12-red.log`. Kicked-out liveness remained `true`; inactive push overwrote `Kept` with `Rejected`; no-cache push cached its row; parser produced `Pushed!!` instead of `Pushed!`. All four assertions ran against the original connector before production edits.
- Initial focused verification: plugin, client and `use-items` **3 files / 113 tests passed**, `/tmp/monospace-s12-focused.log`. Additional keyed-default and `useItem` scenarios bring focused coverage to **115 tests**, `/tmp/monospace-s12-focused-verified.log`. An intermediate plain-subscribe test used the wrong call shape; changed it to the public subscription builder. Initial typecheck exposed generic-hook annotations and obsolete relation fixture fields; corrected before final checks.
- Final gate results recorded below. No staging, commits, pushes, stashes, resets or branch changes. Existing engine, realtime client and E2E work preserved; no `crates/` source edits.

### Final verification

- Typecheck: `pnpm --filter @monospace/studio typecheck` passed, `/tmp/monospace-s12-typecheck-verified.log`. Scoped root `node_modules/.bin/eslint` passed all seven edited Studio TypeScript files, `/tmp/monospace-s12-eslint-verified.log`. No lint suppressions added. Source plugin is 77 lines; its test file is 253 lines. Pre-existing large source/test files were not broadly refactored.
- Expanded focused command: `pnpm --filter @monospace/studio test:unit --run app/rstore/plugins/__tests__/3.realtime.test.ts app/rstore/realtime/__tests__/client.test.ts layers/collection-query/composables/use-items.test.ts app/rstore/utils/get-selection.test.ts app/rstore/utils/unwrap-nested-data-envelopes.test.ts` — **5 files / 147 tests passed**, `/tmp/monospace-s12-focused-complete.log`. Final full run also includes the added inactive keyed-null cache-deletion regression.
- First full run: **872 files / 10,201 tests passed; 1 test failed**, `/tmp/monospace-s12-full.log`. It had loaded the earlier invalid plain-subscribe test call before that test was corrected. The corrected focused runs above passed; full final-file run follows below.
- Browser command: `LIBCLANG_PATH=/usr/lib64 E2E_MONOSPACE_BINARY=/home/akryum/Projects/directus-next/target/debug/monospace E2E_USE_DEV_FRONTEND=true pnpm --filter @monospace/testing test:e2e tests/realtime/live-lists.spec.ts --no-deps` — **2 tests passed** on warm rerun (1.2 min), `/tmp/monospace-s12-e2e-final.log`. Uses real engine, PostgreSQL, RabbitMQ and Chromium with two Studio sessions; verifies paginated edits/inserts/deletes, searched relation membership, counts and no observer REST refetch. First cold run passed one test and failed the first navigation on Vite `504 (Outdated Optimize Dep)` before listing rendered, `/tmp/monospace-s12-e2e.log`; spec and assertions were unchanged for rerun. Test harness released its own servers and containers.
- Engine binary was newer than every changed/untracked engine source before launch; reused it instead of rebuilding engine. Harness still compiled/ran its normal `cargo xtask configure` (with plain `cargo`). No engine source, browser spec, catalog or lockfile changed by S12.

- Final full command: `pnpm --filter @monospace/studio test:unit --run` — **873 files / 10,203 tests passed**, no type errors, exit 0 (215.17 s), `/tmp/monospace-s12-full-final.log`. Includes all original behavior coverage and the added keyed-null rejection case. No slow-file reruns needed. Nuxt emits a non-failing `NUXT_B7021` client-manifest warning in unit runs, also present in the original failing-first run; no manifest workaround or unrelated build changes made.
- Final review: no duplicated response/parser pipeline added; `readOptionsKey` and connector `writeItems` removed. Existing response utils remain used by both REST and realtime. `git diff --check` passes for Studio and both plan edits. No remaining S12 product failure or skipped requested gate. Existing S07 engine limitations outside this adoption slice remain documented.
- Post-review typecheck on final files also passed, exit 0: `/tmp/monospace-s12-typecheck-complete.log`.
