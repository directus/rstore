# S05: Vue adapter

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Depends on: S02, S03, S04.
- Owner: optional Vue adaptation.
- Contract: [overview](./00-overview.md).

## Outcome

Vue stores use same registration and DTO protocol as Core. Vue adapter unwraps inspection values and observes reactive changes; portable runtime retains no Vue dependency.

## Files

- Create `packages/devtools/src/vue/index.ts`, `adapter.ts`, `observation.ts`.
- Reserve `src/vue/RstoreDevtoolsPanel.vue` for S12 integration.
- Create `packages/devtools/test/vue-adapter.spec.ts`.
- Update Vue package entry configuration and dedicated optional-peer declarations from S01.

Do not move adapter into `@rstore/vue`; dependency direction remains devtools to optional Vue.

## Adapter contract

Use one neutral adapter interface declared by S04. Adapter supplies value unwrap, optional cache reader, and observation cleanup. Vue adapter uses `isRef`, `unref`, and `toRaw` only inside Vue entry.

Unwrap at each projection traversal boundary. Nested refs must resolve without losing cycle detection. Avoid eager deep clone, deep traversal by `JSON.stringify`, and invoking computed/functions beyond normal value observation. Catch read failures and represent unavailable/error previews without changing application behavior.

Prefer S02 public `cache.inspect()` over Vue private layers. Adapter override exists for external cache integrations, not to preserve inspector access to `_private.layers`.

Create scoped observation with `effectScope`; watch relevant module state and layer inspection. Return explicit disposer, independent from current component scope. Watchers are activated only by registered interest and torn down when interest ends. Observe descriptors/projections using S03 budgets so large modules do not trigger unbounded deep-watch traversal.

A ref exposing value changes should update module revision. A callable module member remains metadata. Projection accessors remain markers; do not execute arbitrary object getters merely because adapter is reactive.

## Implementation sequence

1. Write tests with actual Vue `createStore` and existing real-cache factory.
2. Add unwrap implementation and cycle-safe integration with S03.
3. Add scoped observation; runtime chooses observer supplied by adapter rather than starting Core polling simultaneously.
4. Verify automatic cleanup on store dispose, registration dispose, and runtime dispose.
5. Export `createVueDevtoolsAdapter` from `@rstore/devtools/vue` only.
6. Include Vue subpath in build and type fixture. Root Node import must continue working without optional Vue peer installed.

## Tests first

- Nested refs, reactive objects, maps/sets, and ref cycles produce stable bounded previews.
- Live module ref update invalidates only its store; no extra Core polling timer.
- Disposed/replaced registration cannot publish late watcher results.
- Two registrations with different adapters do not share effects.
- Accessor/function preview never executes arbitrary callback.
- Repeated subscribe/unsubscribe and runtime disposal leave no active watchers.
- Public cache inspection works for base rows and optimistic layer changes.
- Core runtime import remains independent of Vue at runtime.

Use fake timers for observation cleanup, real Vue reactivity for semantic changes. Avoid tests asserting internal watcher count except through observable absence of callbacks/work after disposal.

Run `pnpm exec vitest run --project unit packages/devtools/test/vue-adapter.spec.ts`; rerun projection tests if unwrap traversal changes.

## Exit gate

Same read handlers inspect Core and Vue stores. Vue updates are visible without leaked effects. Vue import is confined to optional subpath and inspector bundle.

## Implementation receipt

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Changed files: `src/vue/{index,adapter,observation,unwrap,panel}.ts`; `test/vue-adapter.spec.ts`; shared real-browser Devtools fixture.
- Tests demonstrated failing before implementation: initial new-API import failed before adapter existed. Later real reactive layer scenario failed with `expected ['cache'], received ['modules']`, then passed after separating cache/module invalidations. This is behavior failure evidence; initial import failure alone is not.
- Commands and results: direct Node 26 Vitest, `--project unit packages/devtools/test/vue-adapter.spec.ts packages/devtools/test/browser-channel.spec.ts`: ten tests pass across both files, including six adapter cases. Scoped ESLint and complete browser-suite TypeScript check pass.
- Final review regressions: actual module containing 2,000 accessor properties examined tail descriptors twice before reflection budget fix, then zero afterward. Plain `{ __v_isRef: true, get value() }` executed getter and projected scalar 42 before fix; afterward projection preserves accessor marker and real module observation invokes no getter. Same regression includes inherited data flag with own value getter. Genuine Vue `customRef` still unwraps normally. Both original tests demonstrated meaningful failures before fixes.
- Inherited value accessor follow-up: inherited ref flag plus inherited application getter projected scalar 101 before fix. Adapter now recognizes genuine getter identities from public Vue `ref`, `computed`, `customRef`, and both `toRef` constructors while rejecting application value accessors throughout bounded prototype inspection; unexamined prototype tails fail closed. Own/inherited lookalikes remain inert in projection and actual module observation. Real variants retain independently asserted values 7–11. Ten focused tests, scoped ESLint, and browser TypeScript passed after fix. Coordinator verified final rebuilt getter identities/bounded-tail guard, affected library/client types, full 1,980-test suite, thirteen actual browser cases, and final-v4 installed package acceptance.
- Browser evidence: actual Core/Vue iframe suite passes three scenarios through shared Vite/Xvfb runner; Vue `defineModule` state change arrives through a scoped watcher lease.
- Cleanup evidence: actual cache disposal ends first registration observation while second still publishes; runtime disposal ends second. Explicit layer watcher disposal suppresses later changes.
- Limitations / follow-up: only reactive values or real cache hooks invalidate automatically; changing a plain layer object without a cache hook requires explicit refresh. Observation/projection stops at configured budgets. Root optional-peer import and packed-package build proof belongs to S16. Panel implemented as `defineComponent`/`h` in TypeScript so unbuild can publish Vue entry without a raw `.vue` import.

## Final coordinator acceptance

- Slice evidence: Genuine Vue refs/custom refs unwrap; forged ref flags and accessor-only objects remain bounded without invoking arbitrary getters. Final ten-case adapter/channel regression focus, genuine public constructor getter identities, fail-closed unexamined prototype tails, actual Vue module watcher lease, client types, and rebuilt browser/package checks passed.
- Final aggregate gates: `pnpm test` passed 267 files / 1,980 tests; one distribution file / four cases conditionally skipped in default run, then all four passed against final v4 tarballs outside monorepo. Final headless browser matrix passed 13 cases in 6.9 seconds. Seven real Nuxt boot files passed, including final SSR lifecycle/privacy and browser/disabled/production scenarios.
- Final tooling gates: all 21 workspace typecheck scripts plus integration/browser types passed through serial `pnpm test:types`; full repository ESLint passed; shared/Core/Vue/devtools builds and Nuxt module build passed serially; docs build passed. Nine current guide snippets passed strict final-v4 installed declarations without aliases or `skipLibCheck`. After last inherited-getter guard repair, affected devtools library/client typechecks, rebuilt artifact, full suite, browser matrix, and installed consumers were rerun successfully; full workspace types and lint had already passed with unchanged public API. See S16 for external ambient-type boundaries.
- Failure-first tests and private fault probes preserved. Source owners confirmed freeze before coordinator consolidation. No staging, commit, or push performed.
