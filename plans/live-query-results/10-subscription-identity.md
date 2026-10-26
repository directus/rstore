# S10: subscription identity

- Status: review fixes implemented and verified locally on 2026-10-26; receipt below.
- Depends on: S03, [S08](./08-subscribe-payload.md).
- Owner: when a page subscription is reopened.

## Outcome

Reopen only when the resolved server read changes. Plain `subscribe()` and unpaged `liveQuery()` retain their normal behavior.

## API and semantics

- Compare resolved options: store defaults plus `resolveFindOptions` transforms using current metadata, exactly as passed to subscribe hooks.
- Ignore function values and client-only controls: `fetchPolicy`, `dedupe`, `experimentalGarbageCollection`, and `fetchOptions` (including `autoRefresh`). Keep `resultMode`, which shapes pushed-result representation.
- Raw-different/resolved-equal inputs retain transport. Metadata changes that resolve differently reopen it. Collection changes and disabling still close it.
- Retained callbacks use current page controls. Removed pages reject old delivery immediately, including base changes hidden by page overrides.
- Teardown receives original opening options and key. Hook mutations cannot change the retained snapshot.
- There is no connector identity override API. Connectors consume resolved options directly.
- Cache resolution per followed page and share it across comparison, opening and callback ownership. Callbacks inspect only their own page and the shared base-read ownership fence.

## Files

- `packages/vue/src/query/options.ts`: compare resolved server reads.
- `packages/vue/src/api/{subscription,livePages}.ts`: reuse cached resolution and preserve synchronous ownership fences.
- `packages/shared/src/types/hooks/realtime.ts`: required resolved payloads.
- `packages/core/src/{plugin,subscription/subscribe}.ts`, Drizzle and playground: remove obsolete connector override wiring.
- Public query type tests contain the subscription contract; no separate identity-hook type test remains.

## Tests first

- Client controls retain live and plain subscriptions, including held registration.
- Omitted defaults made explicit retain transport and usable callbacks.
- Metadata-driven read changes reopen and reject old callbacks.
- Changed server options/resultMode reopen; disablement and collection changes close.
- Secondary page options change through public input, with equivalent options retaining transport.
- Queued teardown reads current resolution metadata before opening.
- Each newly selected page resolves once; unchanged ownership checks resolve none.

## Monospace impact

The client-only typing controls can retain subscriptions without connector overrides. Search changes still reopen when their resolved server read changes; debounce remains in `useItems`. External adoption stays in S12.

## Implementation receipt

### Review fixes

- Findings: raw options caused false reopen/missed metadata changes; connector overrides duplicated resolved comparison; page callbacks resolved every selected page; opening repeated resolution; hook mutation could corrupt teardown options; payload/result declarations lagged runtime.
- Changes: compare resolved options with client-only exclusions, remove connector override API and wiring, cache each page read and shared base fence, preserve Core resolution marker with explicit keys, isolate hook options, require hook `findOptions`, expose readonly plain `live`, consolidate type coverage, update docs/skills/changelog notes.
- Failing-first evidence: six behavioral failures in `/tmp/rstore-review-red.log`; compile failures in `/tmp/rstore-review-types-red.log` prove missing `live` and optional payloads. Plain fetchPolicy retention already passed and remains covered.
- Verification commands/results (Node 26.2.0 + pnpm 10.20.0 selected via `PATH=/tmp/rstore-review-bin:$PATH`):
  - `pnpm exec vitest run --project integration packages/vue/test/integration/query/subscription-identity.spec.ts packages/vue/test/integration/query/subscribe-payload.spec.ts packages/core/test/integration/subscription-dispatch.spec.ts`: initial **6 failed / 21 passed**; `/tmp/rstore-review-red.log`. All failures were contract assertions, including `2` resolutions instead of `1`, mutated teardown topic, two page resolutions instead of zero, and wrong callback ownership outcomes.
  - `pnpm --filter @rstore/vue test:types`: initial compile failures for optional hook options and missing `SubscribeResult.live`; `/tmp/rstore-review-types-red.log`.
  - `pnpm exec vitest run --project integration packages/vue/test/integration/query packages/vue/test/integration/subscriptions.spec.ts packages/core/test/integration/subscription-dispatch.spec.ts`: **44 files / 321 tests passed** before merging redundant ended-cost coverage; `/tmp/rstore-review-focused.log`.
  - `pnpm exec vitest run --project integration packages/vue/test/integration/garbage-collection/listener-lifetime.spec.ts packages/vue/test/integration/query/subscription-identity.spec.ts packages/vue/test/integration/query/subscribe-payload.spec.ts packages/vue/test/integration/query/live-pages.spec.ts packages/core/test/integration/subscription-dispatch.spec.ts`: final **5 files / 51 tests passed**; `/tmp/rstore-review-focused-final.log`.
  - `pnpm exec vitest run --project integration packages/vue/test/integration/garbage-collection/listener-lifetime.spec.ts packages/vue/test/integration/query/subscription-identity.spec.ts packages/vue/test/integration/query/subscribe-payload.spec.ts packages/vue/test/integration/query/live-pages.spec.ts packages/vue/test/integration/query/ended-live-queries.spec.ts`: **5 files / 59 tests passed**, including real GC/lifetime and bounded recovery; `/tmp/rstore-review-lifetime-green.log`.
  - `pnpm exec vitest run --project unit packages/shared/test/utils/hookable.spec.ts packages/shared/test/utils/hookable-inspection.spec.ts packages/vue/test/public-exports.spec.ts`: **3 files / 24 tests passed**; `/tmp/rstore-review-unit.log`.
  - `pnpm --filter @rstore/shared build` and `pnpm --filter @rstore/core build`: passed; refreshed downstream declarations after hook type changes.
  - `pnpm test:types`: passed all workspace scripts and integration/browser checks; `/tmp/rstore-review-types-final.log`.
  - `pnpm exec eslint --no-ignore <changed source/spec/type/docs/plan/skill files>`: passed, including normally ignored skill Markdown; `/tmp/rstore-review-lint-final.log`. Final audit also linted every currently modified/untracked `.ts`, `.vue`, and `.md` file with `--no-ignore`: passed; `/tmp/rstore-review-all-changed-lint.log`.
  - First full `pnpm test` with approved localhost access: **321 files passed / 1 failed / 1 skipped**, **2,321 tests passed / 3 failed / 4 skipped** plus two unhandled errors; `/tmp/rstore-review-full.log`. New computed watcher exposed an existing unmount regression test. Reproduced before fixing in `/tmp/rstore-review-lifetime-red.log` (**3 failed / 6 passed**). Batching live-page transport watchers fixed unsafe options reads during unmount; synchronous per-page callback checks retain stale-delivery fences. The later focused lifetime run passes without unhandled errors.
  - Final full `pnpm test` with approved localhost access: **322 files / 2,324 tests passed; 1 file / 4 installed-consumer distribution cases conditionally skipped**. No unhandled errors. `/tmp/rstore-review-full-final.log`. All requested checks ran; external Monospace adoption remains outside scope.
  - `git diff --check`: passed. Changed source files stay below 300 lines. No staging, commit, push, branch changes, stash, or reset.
- Final review: removed connector-only tests, retained their useful lifecycle cases under resolved comparison, changed secondary-page identity coverage through caller-owned reactive public input, consolidated required-payload/readonly-live type assertions into `query-public-api.test-d.ts`, and merged duplicate ended-cost coverage into the three-page resolution test. Existing base-reset, collection ownership, teardown retry, held registration, rapid option changes, and plain/unpaged subscription coverage remains.
- Proof boundary: Core/Vue behavior and local connector tests run with shared fake remote storage; full suite also exercises local HTTP/WebSocket, SQLite and Nuxt fixtures. No external Monospace deployment/interoperability check; S12 owns adoption. Distribution cases remain conditional on installed-consumer environment variables. No independent mutation probe run; recorded failing-first assertions demonstrate the original defects.
