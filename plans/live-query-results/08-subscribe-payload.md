# S08: resolved subscribe payload

- Status: implemented and verified (2026-10-26).
- Depends on: S01–S03.
- Owner: what the `subscribe` hook receives for live queries.

## Outcome

Connectors receive the same options a fetch of that page would use, and the key of every keyed live query, so they never resolve options themselves.

## Gaps closed

1. **Unresolved find options.** Fetch hooks receive options after the `resolveFindOptions` hooks ran; `subscribe` receives the raw page options. A connector that turns options into a server read (Monospace: text search becomes a filter in `resolveFindOptions`) subscribes to a different read than it fetched unless it calls `store.$resolveFindOptions` itself. `livePages.ts` already resolves the options, but only to decide `pageIndex`.
2. **Missing key.** `liveQuery(q => q.first(key))` carries the key inside `findOptions.key`; `payload.key` is only set for plain `subscribe(key)`. Connectors read it back from find options.

## API

```ts
hook('subscribe', ({ key, findOptions }) => {
  // findOptions: resolved exactly like the fetch of the followed page
  // key: set for every keyed subscription, plain or live
})
```

- `findOptions` becomes the resolved options (base + page identity options + defaults + `resolveFindOptions` hook changes), the same object shape fetch hooks get.
- No `rawFindOptions` field: no in-repo connector needs unresolved options.
- `key` is set whenever the subscription targets one item, wherever the key came from.

## Semantics

- Resolution runs when the subscription is (re)opened, with the query's current meta, like `loadPage`.
- Subscription identity compares resolved options with client-only exclusions; see [S10](./10-subscription-identity.md).
- Plain `subscribe()` gets the same resolution.

## Files

- `packages/vue/src/api/{subscription,livePages,query}.ts`: resolve before calling `subscribe`; pass `key` for keyed live queries.
- `packages/core/src/subscription/subscribe.ts`, `packages/shared/src/types/hooks/realtime.ts`: payload fields and docs.
- `packages/nuxt-drizzle/src/runtime/plugin-realtime.ts` (and other in-repo connectors): drop any local resolution.

## Tests first

- A `resolveFindOptions` hook that adds a filter is visible in the `subscribe` payload of a live query, on the main page and a followed page.
- `liveQuery(q => q.first('1'))` and `subscribe('1')` both get `key: '1'`.

## Exit gate

Focused integration specs, types, lint, full suite; hooks guide updated.

## Monospace impact

`3.realtime.ts` drops `store.$resolveFindOptions` and `readOptionsKey`.

## Implementation receipt

Initial implementation evidence below; review fixes supersede the raw identity and repeated-resolution details.

- Status: implemented and verified on 2026-10-26. No staging, commit, or push.
- Changed files:
  - `packages/core/src/subscription/subscribe.ts`: resolve defaults and hook changes before dispatch, extract keyed options into `payload.key`, and accept explicit query cardinality for unkeyed `first` queries.
  - `packages/vue/src/api/subscription.ts`: resolve detached options with current metadata when opening, retain raw subscription identity, guard synchronous invalidation during resolution, and retain resolved key/options for teardown.
  - `packages/vue/src/api/livePages.ts`: supply query cardinality and derive `pageIndex` from the same resolved options delivered to the connector.
  - `packages/shared/src/types/hooks/realtime.ts`: document resolved payload and teardown options.
  - `packages/nuxt-drizzle/src/runtime/plugin-realtime.ts`: document direct use of resolved options and matching teardown topics. Its existing `findOptions.where` consumption already works; no connector-side resolution existed to remove.
  - `packages/vue/test/integration/query/subscribe-payload.spec.ts`: six public-workflow regressions covering main/followed pages, defaults, hook-added filters, string/zero keys, plain subscription teardown, singular resolution, and current query metadata on reopen.
  - `packages/core/test/integration/subscription-dispatch.spec.ts`: direct Core keyed-option resolution regression.
  - `packages/vue/test/integration/subscriptions.spec.ts`: update two payload-shape assertions for resolved defaults/key; retain collection-wide delivery and reactive key replacement scenarios.
  - `docs/guide/plugin/hooks.md`: resolved options, keyed live payloads, direct connector consumption, and retained teardown options.
  - This slice plan: settled API, status, and receipt. Other pre-existing plan edits left intact.
- Failing-first evidence: before source changes, the two focused specs reported **7 failed / 5 passed**. Both page cases lacked `pageSize`, `fetchPolicy`, and `params.where`; keyed live cases reported `expected undefined to be '1'` and `expected undefined to be +0`; plain options lacked the translated filter; unkeyed `first` lacked singular resolution; direct Core subscribe lacked both resolved params and top-level key. Full failure output retained at `/tmp/rstore-s08-red.log`; these were behavioral assertion failures, not import failures.
- Commands and results (Node 26.2.0 selected through `PATH` to bypass the read-only mise shim):
  - `pnpm exec vitest run --project unit packages/vue/test/integration/query/subscribe-payload.spec.ts`: no files discovered, as repository configuration excludes integration specs from `unit`; recorded at `/tmp/rstore-s08-unit.log`.
  - `pnpm exec vitest run --project integration packages/vue/test/integration/query/subscribe-payload.spec.ts packages/core/test/integration/subscription-dispatch.spec.ts packages/vue/test/integration/subscriptions.spec.ts packages/vue/test/integration/query/live-pages.spec.ts packages/vue/test/integration/query/subscription-teardown.spec.ts packages/vue/test/integration/query/subscription-ownership.spec.ts packages/vue/test/integration/query/live-query-meta.spec.ts`: **7 files / 48 tests passed**; `/tmp/rstore-s08-focused.log`.
  - `pnpm exec vitest run --project unit packages/vue/test/public-exports.spec.ts`: **1 file / 1 test passed**; `/tmp/rstore-s08-unit-exports.log`.
  - `pnpm --filter @rstore/core build`: passed; refreshed stale downstream declarations after adding `many` to Core subscribe inputs. `/tmp/rstore-s08-core-build.log`.
  - `pnpm test:types`: passed across workspace, integration, and browser typechecks after correcting keyed-option types and rebuilding Core declarations; `/tmp/rstore-s08-types.log`.
  - `pnpm exec eslint` on all changed source/spec files, hooks guide, and this plan: passed. Source/spec output at `/tmp/rstore-s08-lint.log`.
  - Initial sandboxed `pnpm test`: **302 files passed / 17 failed / 1 skipped**, **2,233 tests passed / 34 failed / 14 skipped**; local listener restrictions caused HTTP/WebSocket/Nuxt failures (`listen EPERM: operation not permitted 127.0.0.1`); `/tmp/rstore-s08-full.log`.
  - `pnpm test` with approved broader permissions for localhost listeners: **319 files passed / 1 skipped**, **2,277 tests passed / 4 skipped**; all seven Nuxt boot files passed. `/tmp/rstore-s08-full-unrestricted.log`.
  - `git diff --check`: passed. Changed source files remain below 300 lines.
- Final review: reused the existing store/fake-remote and live-query helpers, kept raw comparison separate from connector payloads, and preserved resolution markers to avoid applying transforms twice. Existing ownership, teardown failure/retry, disabled-query, reconnect, and page-selection regressions pass.
- Limitations / follow-ups: the four distribution cases remain conditionally skipped by the default suite. No external Monospace deployment tested; its connector adoption belongs to S12. Subscription identity changes remain S10 work. Audited other in-repo connectors/examples/playgrounds: playground WebSocket plugin uses collection topics only, and no subscribe connector needs raw options or local resolution, so no further migration edits were needed. No independent fault injection performed; the seven failing-first regressions demonstrate sensitivity to the original defects.

### Review fixes

- Findings: an explicit Core key discarded the resolved marker; the opening options snapshot was shared with mutable subscribe hooks; repeated Vue resolution increased page callback cost; hook declarations made always-present options optional; plain subscription types omitted runtime `live`.
- Changes: preserve property descriptors when attaching explicit keys, detach hook options (including teardown retries), reuse cached resolved page reads, require `findOptions` in both realtime hooks, type readonly plain `live`, and document no-argument defaults/`many: true` plus retained teardown options. The S10 receipt covers resolved comparison and connector cleanup.
- Failing-first evidence: `/tmp/rstore-review-red.log` shows Core resolution count `2` rather than `1`, mutated teardown topic, duplicate plain resolution, and page resolutions during `ended`; `/tmp/rstore-review-types-red.log` shows optional payload/missing `live` failures. Tests use real Core/Vue entry points with the shared fake remote only.
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
