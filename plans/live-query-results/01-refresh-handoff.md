# S01: refresh handoff

- Status: verified on 2026-10-23; landed in `4dd1de55`.
- Depends on: none.
- Owner: subscription payload of live queries.
- Contract: [overview](./00-overview.md).

## Outcome

- The subscribe hook of a live query receives `refresh(options?)`, which refetches the query it belongs to. Plain subscriptions receive none.
- A live query whose options say `enabled: false` stays unsubscribed until it is enabled.

## Files

- `packages/shared/src/types/query.ts`: `QueryRefreshOptions` (`pages`, `prune`) shared by Vue and hook types.
- `packages/shared/src/types/hooks/realtime.ts`: `refresh` on the `subscribe` payload.
- `packages/core/src/subscription/subscribe.ts`: forwards `refresh`.
- `packages/vue/src/api/query.ts`: late-bound `refreshQuery` and the disabled-options guard in `subNow`.
- `packages/vue/src/query/types.ts`: `VueQueryRefreshOptions` aliases the shared type.
- `packages/vue/test/integration/subscriptions.spec.ts`: four new cases.

## Remaining work

1. Docs:
   - Document `payload.refresh` under `docs/guide/plugin/hooks.md#subscribe`, including `pages` and `{ resultMode: 'responseRefs' }` membership replacement.
   - Note in `docs/guide/data/live.md` that disabled live queries do not subscribe.
2. Check the `refresh` arrow: `async options => refreshQuery?.(options)` resolves `undefined` if the query was not created yet. That can't happen, because hooks run after `createApiQuery` in the same tick, but a comment should say so.
3. Type fixture: add a `query-public-api.test-d.ts` assertion that the hook payload's `refresh` accepts `{ pages: number[] }`.

## Tests (present)

- A live query's refresh refetches and publishes the new result.
- `responseRefs` refresh reconciles membership without deleting rows another query shows.
- Plain subscriptions get no `refresh`.
- Disabled live queries don't subscribe; enabling subscribes once and disabling unsubscribes.

## Exit gate

Focused spec, `pnpm test:types`, lint and docs build pass.

## Implementation receipt

- Status: verified; remaining work and acceptance gates completed on 2026-10-23. No staging, commit or push.
- Changed files:
  - Existing S01 implementation retained in `packages/core/src/subscription/subscribe.ts`, `packages/shared/src/types/{query,hooks/realtime}.ts`, `packages/vue/src/api/query.ts`, `packages/vue/src/query/types.ts`, and `packages/vue/test/integration/subscriptions.spec.ts`.
  - Completed docs in `docs/guide/plugin/hooks.md` and `docs/guide/data/live.md`: live-query-only refresh, `pages` selection, `responseRefs` membership replacement without deleting shared rows, and disabled subscription lifecycle.
  - Added public hook type assertion in `packages/vue/test/query-public-api.test-d.ts` for `refresh({ pages: [0, 2] })`.
  - Explained promise-queue ordering of the late-bound refresh callback and documented `SubscribeToApiQueryOptions` in `packages/vue/src/api/query.ts`; updated this plan's status and receipt.
- Failing-first evidence:
  - S01 code and four integration cases already existed on entry. Kept them intact; copied current tests and source to `/tmp/rstore-s01-red` with private runner caches, then substituted HEAD versions of Core subscribe, the shared hook payload, and the Vue API runner in that copy only.
  - `pnpm exec vitest run --project integration packages/vue/test/integration/subscriptions.spec.ts` in the pre-S01 copy: **3 failed, 9 passed**. Both refresh cases failed with `expected undefined to be type of 'function'`; disabled query case failed with `expected 2 to be 1`. Plain subscriptions correctly had no refresh before and after S01. Log: `/tmp/rstore-s01-red.log`.
  - Wrote the new type assertion before final implementation/doc edits. Isolated `pnpm exec tsc --noEmit -p /tmp/rstore-s01-red/packages/vue/tsconfig.json`, narrowed to the public fixture with source aliases, failed with `Property 'refresh' does not exist` at the new assertion. Log: `/tmp/rstore-s01-red-type-fixture.log`. Copying current S01 source into that isolated fixture made the same check pass (exit 0; `/tmp/rstore-s01-green-type-fixture.log`).
- Commands and results:
  - Commands used installed Node 26.2.0 on `PATH`; initial mise shim attempt failed with `Read-only file system`. The standalone pnpm launcher reports its embedded Node 20, while `pnpm exec node --version` confirms child commands use Node 26.2.0.
  - Requested `pnpm exec vitest run --project unit packages/vue/test/integration/subscriptions.spec.ts`: no test files found, because repository config excludes integration specs from `unit`.
  - Correct focused command, `pnpm exec vitest run --project integration packages/vue/test/integration/subscriptions.spec.ts`: **12 passed**, both before and after remaining-work edits. Final log: `/tmp/rstore-s01-focused-final.log`.
  - `pnpm test:types`: **passed**, including 21 package scripts plus integration and browser TypeScript checks. Log: `/tmp/rstore-s01-types.log`.
  - `pnpm exec eslint packages/core/src/subscription/subscribe.ts packages/shared/src/types/hooks/realtime.ts packages/shared/src/types/query.ts packages/vue/src/api/query.ts packages/vue/src/query/types.ts packages/vue/test/integration/subscriptions.spec.ts packages/vue/test/query-public-api.test-d.ts docs/guide/plugin/hooks.md docs/guide/data/live.md`: **passed**. Log: `/tmp/rstore-s01-lint.log`.
  - `pnpm docs:build`: first sandbox attempt failed with `spawnSync git EPERM`; retry outside sandbox **passed**, including rendering pages. Existing bundle-size and Tailwind plugin warnings remain. Log: `/tmp/rstore-s01-docs-retry.log`.
  - `pnpm test`: initial sandbox attempt failed (17 files / 34 cases) with local socket/process restrictions, including `listen EPERM: operation not permitted 127.0.0.1` and `GetPortError`. Retry outside sandbox **passed: 284 files, 2,059 tests; 1 file / 4 tests conditionally skipped**. Log: `/tmp/rstore-s01-full-retry.log`.
  - `git diff --check`: **passed**. All S01 source files remain below 300 lines; final review found no new duplicated helpers or tests.
- Limitations / follow-ups: integration uses real stores/cache/Vue lifecycle with the shared stateful fake remote; this does not prove external connector interoperability. Four Devtools distribution cases require separately installed tarballs (`RSTORE_DISTRIBUTION_ROOT` / `RSTORE_DISTRIBUTION_PEERS_ROOT`) and remain skipped by the default suite. S02–S07 remain separate slices; no S01 follow-up remains.
