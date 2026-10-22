# S13: Nuxt browser integration

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Depends on: S05, S07, S12.
- Owner: development Nuxt wrapper around shared runtime.
- Contract: [overview](./00-overview.md).

## Outcome

Nuxt registers its browser Vue store through portable runtime. Nuxt DevTools custom tab remains; all instrumentation/read/action logic comes from devtools package.

## Files

- Update `packages/nuxt/src/module.ts`, `src/devtools.ts`, `src/runtime/plugin.ts`.
- Replace `src/runtime/devtools/index.ts` with small host wrapper; create `browser.ts`, `options.ts` if needed.
- Remove obsolete `src/runtime/devtools/{client,stats,cache,history,modules,subscriptions}.ts` after their consumers migrate.
- Update `packages/nuxt/package.json` dependency and generated types.
- Create `packages/nuxt/test/devtools-module.spec.ts`, `test/nuxt-boot/devtools.spec.ts`, shared fixture under existing Nuxt test fixture layout.
- Add real browser scenario `test/browser/devtoolsNuxt.spec.ts` using existing process-group ownership.
- Add explicit Nuxt boot suite to current `vitest.config.ts` serialized project.

## Module options and server integration

Add documented `rstore.devtools` boolean/object option. Default enabled when `nuxt.options.dev`, disabled in production. Object supports base path and readOnly; derive browser bootstrap from module-owned configuration.

Install S12 Vite host once for Nuxt client dev server. Keep custom tab name/title/icon/iframe behavior, derive URLs from configured base. Remove sirv/private proxy duplication and port3300 fallback once shared hosting works.

Register module shutdown cleanup for relay/Vite resources. Only one owner mounts endpoints. If Nuxt invokes server hooks for client/SSR configurations, guard registration by actual server instance; do not start duplicate relays.

Browser public bootstrap contains relay address, public client trust configuration, base path, and protocol version only. SSR credential remains absent; S14 adds private server config.

## Browser runtime changes

Before `createStore`, create browser devtools runtime in development and append its plugin with `id: 'default'`, Vue adapter, configured readOnly. Current plugin setup lacks store; rely on S04 init binding rather than `useNuxtApp` inside neutral instrumentation.

Keep devtools runtime associated with this Nuxt app instance. HMR/runtime replacement disposes prior registration and listeners. If replacement creates new runtime, generate new session identity; never reuse stale generation authority.

Preserve existing application cache serialization at `app:rendered` and browser cache hydration. Devtools capture must not modify application's `$srstore` payload semantics or add producer/session/token into that payload.

For server branch, avoid initializing browser globals or Vue observation. S14 installs separate read-only SSR runtime; until then, server path remains without browser instrumentation. Do not claim SSR complete in this slice.

Remove `window.__RSTORE_DEVTOOLS__`, Nuxt DevTools host RPC bridge, `useState` instrumentation stats, and old $rstore* event augmentations once migrated client no longer imports them. No duplicate shared+legacy capture.

## Tests first

Module tests verify emitted plugin/options and development gating; real Nuxt boot/browser tests establish runtime behavior.

- Development boots inspector custom tab and real client store registers once.
- Cache/history/module changes appear through shared DTO protocol.
- Two Nuxt app/HMR lifetimes do not share listeners or stale registrations.
- Custom base works without separate inspector process.
- readOnly rejects direct crafted write as well as UI control.
- Browser hydration preserves preexisting payload/cache behavior.
- Production build has no devtools bootstrap, routes, private config, or old global.
- Disabled development option starts no instrumentation/relay.
- Server render does not touch window and remains unaffected before S14.

Use current `nuxt-boot` serialized project. Update explicit included file list; putting file under matching-looking directory alone does not guarantee execution. Reuse existing fixture/process utilities; no mocked Nuxt acceptance claim.

## Implementation sequence

Write gating tests, add module option/config, mount shared host, bind browser runtime before store construction, then remove obsolete instrumentation files/types. Run focused module tests and real Nuxt boot/browser proof serially.

## Exit gate

Nuxt browser data/actions work through shared runtime with no legacy global/state bridge. Disabled and production modes exclude instrumentation. SSR remains explicitly assigned to S14.

## Implementation receipt

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Changed files: `packages/nuxt/src/{module,devtools}.ts`, `runtime/plugin.ts`, `runtime/devtools/{index,browser,options}.ts`; removed legacy client/stats/cache/history/modules/subscriptions instrumentation. New option tests and real Nuxt boot fixture under `packages/nuxt/test/fixtures/devtools`, test under `test/nuxt-boot/devtools.spec.ts`.
- Tests demonstrated failing before implementation: option scenarios written before resolver; pre-implementation failing execution not captured. Real Nuxt browser acceptance exposed competing frontend WebSocket upgrade owners; viewer closed and browser producer unavailable until host used official Devframe sidecar. Real SSR boot exposed private config cloning and partial runtime update dropping app configuration; full private-config publication fixes recorded S14. Disabled-fixture setup initially used parent overrides that Nuxt dev child ignores; disk fixture now expresses opt-out and strict 404 assertions remain.
- Commands and results: direct Node 26 Vitest `run --project nuxt packages/nuxt/test/devtools-module.spec.ts --maxWorkers 1`, two tests passed. Changed-file whitespace and repository ESLint over owned Nuxt/module/options/browser sources/tests passed; SSR owns runtime plugin lint.
- Real Nuxt/browser evidence: serialized `nuxt-boot` file uses actual Nuxt child server and headless Chromium via existing `createPage` utility. Three scenarios passed: custom inspector/secret-safe discovery; hydration of numeric-key SSR cache, automatic browser registration, direct crafted read-only rejection, reload with fresh session and old-target denial, authenticated standalone Cache UI, and surviving viewer after inspector closes; active/completed SSR reads through authenticated official sidecar and write denial. A later repeat completed-record assertion failed from mixed built/source schema after request metadata addition; built SessionSummarySchema lacked new `request` field. Repeat after final rebuild, preserving assertion.
- Production exclusion evidence: actual production fixture with explicit enable passed: application renders, bootstrap/discovery/MCP return 404, real generated browser/server output lacks producer RPC, private SSR field, and legacy global. Actual disabled-development disk fixture also passed application render and strict 404 endpoints. Both use browser:false; browser acceptance uses explicit headless:true and inert OS opener PATH.
- Limitations / follow-up: no dedicated hot-update-without-reload proof; reload identity/ownership tested and HMR teardown wired. Module derives private SSR URL from actual listening port and publishes complete runtime config to Nitro's cloned configuration, preserving app/public fields. Browser bootstrap failure warns and leaves application store creation intact. S14 owns request/error/abort lifecycle proof. Final source/build protocol synchronization and latest SSR metadata parity passed before acceptance freeze.

## Final coordinator acceptance

- Slice evidence: Real final Nuxt boots verified automatic browser registration, payload hydration, read-only denial, reload identity, inspector UI, producer surviving viewer close, secret-free bootstrap/discovery, and disabled/production exclusion. Latest built SSR request schema parity passed.
- Final aggregate gates: `pnpm test` passed 267 files / 1,980 tests; one distribution file / four cases conditionally skipped in default run, then all four passed against final v4 tarballs outside monorepo. Final headless browser matrix passed 13 cases in 6.9 seconds. Seven real Nuxt boot files passed, including final SSR lifecycle/privacy and browser/disabled/production scenarios.
- Final tooling gates: all 21 workspace typecheck scripts plus integration/browser types passed through serial `pnpm test:types`; full repository ESLint passed; shared/Core/Vue/devtools builds and Nuxt module build passed serially; docs build passed. Nine current guide snippets passed strict final-v4 installed declarations without aliases or `skipLibCheck`. After last inherited-getter guard repair, affected devtools library/client typechecks, rebuilt artifact, full suite, browser matrix, and installed consumers were rerun successfully; full workspace types and lint had already passed with unchanged public API. See S16 for external ambient-type boundaries.
- Failure-first tests and private fault probes preserved. Source owners confirmed freeze before coordinator consolidation. No staging, commit, or push performed.
