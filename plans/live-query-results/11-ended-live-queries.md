# S11: ended live queries

- Status: verified; implemented locally on 2026-10-26.
- Depends on: S03.
- Owner: what happens when the server ends a live query.

## Outcome

A connector can tell rstore that a page subscription ended on the server side, and rstore recovers instead of leaving the page silently static.

## Gap closed

When the server ends a live query (Monospace sends `kickedOut`, e.g. after a failed rerun), the connector can only log. rstore still believes the page is live and never resubscribes; the list stops updating until it remounts.

## API

```ts
hook('subscribe', ({ end }) => {
  socket.onKickedOut(reason => end?.({ reason, retry: true }))
})
```

- `end({ reason, retry })` on live-query payloads.
- `retry: true`: rstore reopens the subscription after a backoff (bounded attempts), and refreshes the page once so it doesn't miss changes made in between.
- `retry: false`: rstore marks the page as no longer live and refreshes it once.
- A query-level readonly `live` state reflects whether the followed pages are subscribed, for UIs that want to show it.

## Semantics

- Callbacks of an ended subscription become inactive.
- Retries go through the same per-query queue as other transitions.
- Disposal or options changes cancel pending retries.

## Files

- `packages/vue/src/api/{subscription,livePages,subscriptionQueue}.ts`.
- `packages/shared/src/types/hooks/realtime.ts`.

## Tests first

- `end({ retry: true })` reopens the subscription and refreshes the page once.
- `end({ retry: false })` leaves the page unsubscribed, refreshed once, with `live` false.
- An options change during the backoff cancels the retry.

## Exit gate

Focused integration specs, types, lint, full suite; live guide updated.

## Monospace impact

`3.realtime.ts` forwards `kickedOut` to `end`; the "kicked-out live query stays ended until remount" limitation goes away.

## Implementation receipt

- Status: verified; implemented locally on 2026-10-26. No staging, commit or push. Existing S08–S10 work and other dirty files were preserved.
- Changed files: `packages/shared/src/types/hooks/realtime.ts`; `packages/core/src/subscription/subscribe.ts`; `packages/vue/src/api/{subscription,subscriptionRecovery,livePages,query}.ts`; `packages/vue/src/query/{createQuery,types}.ts`; `packages/vue/src/index.ts`; `packages/vue/test/integration/query/ended-live-queries.spec.ts`; `packages/vue/test/query-public-api.test-d.ts`; `packages/nuxt-drizzle/src/runtime/plugin-realtime.ts`; `packages/nuxt-drizzle/src/runtime/utils/realtime-subscriptions.ts`; `packages/nuxt-drizzle/test/realtime-subscriptions.test.ts`; `docs/guide/data/live.md`; `docs/guide/plugin/hooks.md`; `packages/vue/skills/rstore-vue/references/api-live-query.md`; this plan.
- Behavior: live subscribe payloads expose `end({ reason, retry })`, with exported `EndSubscription` / `EndSubscriptionOptions` types. An end immediately fences the old `setResult`, `refresh` and `end` callbacks. `query.live.value` is readonly, aggregating completed registration of the selected existing pages; ordinary queries, SSR and empty selections report false. Retained-page refreshes do not pulse liveness. Plain `subscribe()` receives no live-query callbacks.
- Retry policy: fixed defaults of three attempts, with exponential backoff of 1, 2 and 4 seconds. Repeated ends, failed registration and teardown-blocked attempts share the budget for the current server-read identity; registration alone does not reset it; an accepted result or successful owned refresh does. Every recovery uses the existing per-query queue. A successful reopen refreshes the followed page once **after** registration, covering changes made during backoff; exhaustion or `retry: false` refreshes once while leaving it ended. Failed partial leases retain exact cleanup identity. Server-read changes, deselection, disablement and scope/store disposal cancel recovery. Equivalent client-only option changes retain the retry budget, consistent with S10. `reason` remains a connector diagnostic, not a query fetch error.
- Connector adoption: Drizzle forwards a rejected wire topic to every matching live subscriber with `retry: true` for `authorize-error` and `retry: false` otherwise, preserves unrelated topics, and stops replaying topics with no remaining plain subscriber. Plain subscriber reconnect behavior stays unchanged. Existing connector/playground APIs remain source-compatible; no playground server-termination event requires additional wiring.
- Tests demonstrated failing before implementation: `pnpm exec vitest run --project integration packages/vue/test/integration/query/ended-live-queries.spec.ts` produced **5 failures / 1 pass**, including `TypeError: ended.ended is not a function` and missing `query.live`. Output: `/tmp/rstore-s11-red.log`. The initial `--project unit` attempt correctly found no files because the unit project excludes integration specs; output: `/tmp/rstore-s11-unit-first.log`.
- Additional failing-first evidence: refreshing before backoff recovery failed the expected request-count assertion (`/tmp/rstore-s11-gap-red.log`); a retained-page refresh emitted `[false, true]` instead of no liveness changes (`/tmp/rstore-s11-live-red.log`); persistent teardown failure prevented the final refresh (`expected 1 to be 2`, `/tmp/rstore-s11-teardown-red.log`). Drizzle rejection fan-out failed with `subscriptions.reject is not a function` (`/tmp/rstore-s11-drizzle-red.log`), and a mixed plain/live topic initially lost plain reconnect replay (`/tmp/rstore-s11-plain-drizzle-red.log`). All now pass. Tests exercise real stores, cache, hooks, queues, Vue scopes and controlled backoff (converted to fake timers by the review fixes below); only the external backend is fake. No owned implementation is mocked and no faults were injected into this shared checkout.
- Focused integration command: `pnpm exec vitest run --project integration packages/vue/test/integration/query/ended-live-queries.spec.ts packages/vue/test/integration/query/subscription-teardown.spec.ts packages/vue/test/integration/query/subscription-identity.spec.ts packages/vue/test/integration/query/live-pages.spec.ts packages/vue/test/integration/subscriptions.spec.ts packages/core/test/integration/subscription-dispatch.spec.ts` — **6 files / 61 tests passed** at the expanded-regression checkpoint (`/tmp/rstore-s11-focus-final.log`). After adding cancellation/SSR cases, `pnpm exec vitest run --project integration packages/vue/test/integration/query/ended-live-queries.spec.ts` — **15 tests passed** (`/tmp/rstore-s11-ended-final.log`). Coverage includes page targeting, one gap refresh, callback inactivity, bounded repeated ends and failed registrations, persistent teardown recovery, held registration, synchronous live observers, options changes, deselection, disabling, scope disposal and plain subscriptions.
- Focused unit command: `pnpm exec vitest run --project unit packages/vue/test/public-exports.spec.ts packages/core/test/public-exports.spec.ts` — **2 files / 3 tests passed**, output `/tmp/rstore-s11-unit-final.log`. Connector command: `pnpm exec vitest run --project nuxt packages/nuxt-drizzle/test/realtime-subscriptions.test.ts packages/nuxt-drizzle/test/realtime-ws.test.ts` — **2 files / 27 tests passed**, output `/tmp/rstore-s11-drizzle-final.log`.
- Types/builds: final `pnpm test:types` passed all 21 workspace scripts plus integration/browser TypeScript, including compile-only end callback exports and readonly liveness (`/tmp/rstore-s11-types-accepted.log`). Initial check found stale Shared declarations; sequential `pnpm --filter @rstore/shared build`, `pnpm --filter @rstore/core build`, and `pnpm --filter @rstore/vue build` refreshed dependent declarations. Vue also rebuilds in its normal typecheck script. Build logs: `/tmp/rstore-s11-build-{shared,core,vue}.log`.
- Lint command: `pnpm exec eslint --no-warn-ignored packages/shared/src/types/hooks/realtime.ts packages/core/src/subscription/subscribe.ts packages/vue/src/api/subscription.ts packages/vue/src/api/subscriptionRecovery.ts packages/vue/src/api/livePages.ts packages/vue/src/api/query.ts packages/vue/src/query/types.ts packages/vue/src/query/createQuery.ts packages/vue/src/index.ts packages/vue/test/integration/query/ended-live-queries.spec.ts packages/vue/test/ended-live-queries.test-d.ts packages/nuxt-drizzle/src/runtime/plugin-realtime.ts packages/nuxt-drizzle/src/runtime/utils/realtime-subscriptions.ts packages/nuxt-drizzle/test/realtime-subscriptions.test.ts docs/guide/data/live.md docs/guide/plugin/hooks.md plans/live-query-results/11-ended-live-queries.md` — passed (`/tmp/rstore-s11-lint-accepted.log`). The normally ignored skill reference also passed `pnpm exec eslint --no-ignore packages/vue/skills/rstore-vue/references/api-live-query.md` (`/tmp/rstore-s11-skill-lint.log`). `git diff --check` passed. Changed source/test files remain below 300 lines; recovery policy lives in a separate 92-line helper.
- Full command: `pnpm test` — **322 files / 2,321 tests passed; 1 file / 4 installed-distribution cases skipped** because their opt-in environment is absent. Initial sandbox run failed on localhost restrictions (`listen EPERM: operation not permitted 127.0.0.1`, `/tmp/rstore-s11-full.log`). Approved escalation allowed HTTP/WebSocket listeners and Nuxt boot tests; final successful output: `/tmp/rstore-s11-full-unsandboxed.log`.
- Environment: default mise shims attempted writes on a read-only filesystem. Commands used installed Node 26.2.0 via a temporary PATH prefix and cached pnpm. pnpm's bundled launcher reports a Node 20 engine warning, but `pnpm exec node -p process.version` confirmed child commands use Node 26.2.0. No repository tooling configuration changed.
- Limitations / follow-ups: liveness reflects local subscribe-hook completion, not server acknowledgement unless the connector waits for it. Retry timings and attempt count are fixed, not configurable. A permanently failing unsubscribe retains its lease for later cleanup while callbacks stay inactive; no transport can be forced to release an unreachable remote lease. Monospace forwarding/adoption remains S12 in its separate checkout. No external-service interoperability, browser E2E or installed-distribution validation was performed. No known remaining S11 product defect.

### Review fixes

- Findings: stale blocked/rejected recovery could enqueue cleanup over a newer replacement; retry budget never recovered after healthy results; callback spelling was `ended`; Drizzle treated thrown authorization errors as permanent; real backoff slowed tests; standalone close rejection escaped handling; docs and type coverage missed parts of the contract.
- Changes: guard recovery ownership before queueing and again before closing. Successful still-owned gap/payload refreshes and accepted `setResult` renew the budget; registration alone does not. Observe recovery and standalone queue rejections while preserving explicit unsubscribe rejection. Rename the unreleased callback to `end?: EndSubscription` through Core, Shared, Vue, Drizzle, docs, skills and S11/S12. Drizzle retries only `authorize-error` among rejection reasons. Merge callback/liveness types into `query-public-api.test-d.ts`, removing the redundant retry-string negative case.
- Test boundary and oracle: real Vue store, hooks, cache and subscription queues; shared fake remote only controls external transport/storage. Fake timers control the backoff algorithm. Two-page held registration and rejecting held registration distinguish obsolete recovery from a replacement: assert exact remote lease IDs plus live state and usable fresh data. Four healthy recovery cycles prove budget renewal for refresh and push separately; synchronous repeated hook kickouts prove the 1/2/4-second guard still stops. Standalone close failures must retain their lease for retry without Vitest reporting an unhandled rejection, while explicit unsubscribe still rejects. Synchronous `end()` inside a subscribe hook must never publish live and must release its lease.
- Failing-first evidence (before source fixes): `pnpm exec vitest run --project integration packages/vue/test/integration/query/ended-live-queries.spec.ts packages/vue/test/integration/query/ended-recovery-races.spec.ts` — **4 failed / 17 passed, plus 1 unhandled rejection** (`/tmp/rstore-s11-review-red.log`). The blocked-reopen case had `live === true` with no remote subscription; rejecting reopen lost the queued replacement; both healthy-result cases missed the second expected reopen. The standalone case emitted `Error: fake-remote: unsubscribe failed`.
- Drizzle failing-first command: `pnpm exec vitest run --project nuxt packages/nuxt-drizzle/test/realtime-subscriptions.test.ts` — **1 failed / 4 passed**, expected `retry: true`, received `false` for `authorize-error` (`/tmp/rstore-s11-review-drizzle-red.log`). Its Vitest project is `nuxt`, not `unit` or `integration`.
- Rename failing-first command: `pnpm exec vitest run --project integration packages/vue/test/integration/query/ended-recovery-races.spec.ts -t 'synchronously inside subscribe'` — **1 failed / 5 skipped** against the old callback shape; the expected closed lease remained registered (`/tmp/rstore-s11-review-api-red.log`). This lifecycle case already passed with the original spelling before the API rename.
- Backoff tests now use `vi.useFakeTimers` / `advanceTimersByTimeAsync`; cancellation asserts the close completed and an additional backoff timer exists, then changes options, asserts the timer disappeared, and advances past every possible retry. No real 1/2/4-second waits remain.
- Focused integration: `pnpm exec vitest run --project integration packages/vue/test/integration/query/ended-live-queries.spec.ts packages/vue/test/integration/query/ended-recovery-races.spec.ts packages/vue/test/integration/query/subscribe-payload.spec.ts packages/vue/test/integration/query/subscription-teardown.spec.ts packages/vue/test/integration/query/subscription-identity.spec.ts packages/vue/test/integration/query/live-pages.spec.ts packages/vue/test/integration/subscriptions.spec.ts packages/core/test/integration/subscription-dispatch.spec.ts` — **8 files / 80 tests passed**, 1.50 s (`/tmp/rstore-s11-review-focused.log`). This retains plain `subscribe()` and unpaged/keyed `liveQuery()` coverage.
- Focused unit: `pnpm exec vitest run --project unit packages/vue/test/public-exports.spec.ts packages/core/test/public-exports.spec.ts` — **2 files / 3 tests passed** (`/tmp/rstore-s11-review-unit.log`). Connector: `pnpm exec vitest run --project nuxt packages/nuxt-drizzle/test/realtime-subscriptions.test.ts packages/nuxt-drizzle/test/realtime-ws.test.ts` — **2 files / 28 tests passed** (`/tmp/rstore-s11-review-connectors.log`). Final public fallback coverage uses plain `subscribe()` watcher failure and explicit unsubscribe rejection, avoiding an internal-module import. No owned logic is mocked or fault-injected.
- Validation environment: installed Node 26.2.0 through a PATH prefix and cached `/home/akryum/.local/share/pnpm/pnpm`, avoiding read-only mise shims. Shared declaration rebuild passed. Auxiliary Core rebuild generated declarations but exited 1 because existing S08 `klona` import triggers `Implicitly bundling "klona"` under unbuild's fail-on-warning policy (`/tmp/rstore-s11-review-build-core.log`); no unrelated dependency/build configuration changed.

- Check refinements: the first types run caught two missing `SubscribePayload` test annotations (`/tmp/rstore-s11-review-types.log`); fixed using the shared payload utility. Lint caught one multiline conditional, one compact object and an internal-helper test import (`/tmp/rstore-s11-review-lint.log`); final fallback regression exercises public plain `subscribe()` instead. Final two regression files: **21 tests passed**, 1.20 s (`/tmp/rstore-s11-review-final-regressions.log`).

- Final types: `pnpm test:types` passed all 21 workspace scripts and integration/browser TypeScript (`/tmp/rstore-s11-review-types-verified.log`). Shared/Core declarations were refreshed first; Vue rebuilt through its normal typecheck script.
- Final lint: `pnpm exec eslint --no-warn-ignored` on Core/Shared/Vue/Drizzle source and test files changed by this review, the three guides and S11/S12/overview plans passed (`/tmp/rstore-s11-review-lint-final.log`). `pnpm exec eslint --no-ignore packages/vue/skills/rstore-vue/SKILL.md packages/vue/skills/rstore-vue/references/api-live-query.md packages/vue/skills/rstore-vue/references/api-subscribe.md packages/vue/skills/rstore-vue/references/api-query.md` passed (`/tmp/rstore-s11-review-skills-lint-final.log`). `git diff --check` passed. Changed source files stay below 300 lines; regression scenarios live in two focused files with shared setup utilities.
- Full suite: `pnpm test` — **324 files / 2,345 tests passed; 1 file / 4 installed-distribution cases skipped** because the opt-in installed-consumer environment is absent; 47.58 s (`/tmp/rstore-s11-review-full.log`). Run used approved localhost access for HTTP/WebSocket and Nuxt boot tests. No full-suite failures or unhandled rejections remain.
- Outcome / limits: all requested S11 fixes verified locally. Plain subscriptions and unpaged/keyed live queries retain their contracts. No external-service interoperability or installed-distribution proof claimed. Auxiliary Core build warning above remains outside this review's S11 scope. No staging, commits, pushes, stashes, resets or branch changes; unrelated dirty work preserved.
