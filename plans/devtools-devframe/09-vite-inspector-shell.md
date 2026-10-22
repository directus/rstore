# S09: Vue/Vite inspector shell

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Depends on: S01, S03, S07, S08.
- Owner: inspector bootstrap and connection state.
- Contract: [overview](./00-overview.md).

## Outcome

Inspector runs as ordinary Vue/Vite SPA using existing Nuxt UI Vite plugin. Shell selects session/store and handles connection state before six read tabs migrate.

## Files

- Create `packages/devtools/index.html`, `vite.config.ts`, `app/main.ts`.
- Create `app/App.vue`, `app/router.ts`, `app/stores/connection.ts`, `selection.ts`, `requests.ts`.
- Create `app/transport/types.ts`, `relay.ts`, `index.ts`; reuse S07 in-page transport.
- Create `app/components/ConnectionState.vue`, `TargetSelector.vue`.
- Update `package.json`, `build.config.ts`, `tsconfig.json`; create focused `tsconfig.client.json`.
- Reuse `app/assets/style.css`, app theme tokens, logo, and neutral formatting utilities.
- Create `packages/devtools/test/inspector-selection.spec.ts`, `test/browser/devtoolsInspector.spec.ts`.

Leave legacy Nuxt bootstrap until S10/S16 removes its consumers. Temporary client typecheck includes new reachable code only; widen after tab migration. Never export a mock live store so old components compile against DTOs.

## Shell behavior

Choose explicit in-page endpoint when embedded parent handshake succeeds. External route accepts validated relay baseURL from controlled bootstrap/connection form. Failed embedded handshake offers clear disconnected state; do not read legacy window globals as fallback.

Central connection store owns transport, sessions, store summaries, selected full target, per-tab revision, and request epochs. Components read shared state directly; avoid prop chains passing connection objects through every tab.

Changing session/store invalidates pending tab requests and clears old data. If selected target disappears, show unavailable selection and require deliberate new selection. Initial default may choose first available target for reads only; actions always require current explicit full target.

Connection state distinguishes connecting, live, disconnected, retained SSR snapshot, incompatible protocol, and authentication error. SSR badges show request metadata and capture time. Do not show disconnected snapshot as live.

Routes use relative/base-aware URLs. Shell loads correctly at `/__rstore`, custom subpath, and standalone relay origin. Do not hardcode panel URL into runtime protocol.

## Request handling

One shared client dispatcher assigns request IDs, validates replies, enforces deadlines, and discards stale epochs. Read cache may be keyed by full target/tab/parameters/revision, bounded by small fixed entry count. Eviction never affects producer data.

Subscribing visible tab receives revision invalidation; refresh coalesces without unlimited request stacking. Hidden tabs unsubscribe. Errors stay associated with target/request so late failure cannot replace new target view.

Connection store disposes transport/subscriptions on app unmount and HMR. Auth credentials stay in memory unless user explicitly configures host; no persistence in URL/localStorage by default.

## Build sequence

1. Prove installed Nuxt UI Vite integration with minimal real Vue bootstrap.
2. Add Pinia/selected existing state choice once; no second independent store system.
3. Wire transport and selection state.
4. Render session/store selectors and connection state.
5. Produce `dist/client` via Vite and library entries via unbuild without either cleaning other's output.
6. Retain legacy build only where existing callers still require it; record temporary migration boundary, remove S16.

Client output must contain no Nitro server, Nuxt DevTools host bridge, or Node/MCP code. Build file placement avoids unbuild/Vite both owning whole `dist` deletion.

## Tests first

- Switching targets discards delayed response/error from old target.
- Removing target clears views; no automatic mutation target substitution.
- Protocol/auth errors distinguish from no registered stores.
- Viewer subscribes only active target/tab and cleans up on unmount.
- Actual browser loads SPA under custom base path and negotiates producer connection.
- Build import graph excludes Node server modules from client.

Test behavior and accessible controls; no class, style, border, or layout assertions. Status/selection use subtle backgrounds per user instruction.

## Exit gate

Built Vue/Vite shell loads through existing browser runner, lists real sessions/stores, and handles stale/failed requests correctly. Six tabs can migrate to explicit DTO state in S10.

## Implementation receipt

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Changed files: ordinary `index.html`/`app/main.ts`/`App.vue`; shared Pinia connection, selection, deadline and transport modules; session/store and connection controls; `SessionRequest.vue` exposes safe SSR metadata even without captured stores. Legacy Nuxt app bootstrap removed.
- Tests demonstrated failing before implementation: initial selection suite failed because implementation did not exist, establishing test-first order only. Later useful SSR regression failed with `expected undefined to be 'error'` before session-only selection was implemented, then passed. Actual two-viewer browser scenario exposed missing registry invalidation; S07 transport fix restored exact generation replacement behavior.
- Commands and results: direct Node 26 Vitest focused inspector suites, 13 tests pass; `vue-tsc --noEmit -p packages/devtools/tsconfig.client.json` and actual repository scoped ESLint pass. Root library/SPA builds and inspector client-only Vite build pass.
- Browser evidence: `node test/browser/run.mjs devtools --project headless`, using inert opener PATH and `RSTORE_DEVTOOLS_TEST_OTP=1`, passed twelve initial scenarios; final rebuilt matrix passed thirteen. Built SPA negotiated official parent channel, custom nested relay base and separate asset origin; minted single-use authentication fragment was consumed/removed without persisted token or credential-bearing WebSocket URL. Two viewers converged on writes and required deliberate selection after generation replacement. OTP test is now part of default matrix, with no CLI/system opener invocation.
- Cleanup/ownership: completed headless runner exited zero and released sockets/display. Async unit tests cover stale replies, failed registry publication and view leases; browser scenarios establish actual handshake and lifecycle behavior separately.
- Temporary legacy build boundary: app and package cutover complete; root owns final independent library/client rebuild.
- Limitations / follow-up: latest session-only SSR metadata scenario must run against rebuilt library/client. Devframe high-level connection persists credentials, so inspector uses official low-level RPC, endpoint resolver, origin-registration and OTP exchange helpers with credentials held in memory.

## Final coordinator acceptance

- Slice evidence: Final built Vue/Vite shell passed actual headless browser matrix, custom base, separate asset origin, in-memory credentials, consumed/removed one-use OTP, independent viewer selections, and session-only failed SSR selection. Final runner exited zero and released owned resources.
- Final aggregate gates: `pnpm test` passed 267 files / 1,980 tests; one distribution file / four cases conditionally skipped in default run, then all four passed against final v4 tarballs outside monorepo. Final headless browser matrix passed 13 cases in 6.9 seconds. Seven real Nuxt boot files passed, including final SSR lifecycle/privacy and browser/disabled/production scenarios.
- Final tooling gates: all 21 workspace typecheck scripts plus integration/browser types passed through serial `pnpm test:types`; full repository ESLint passed; shared/Core/Vue/devtools builds and Nuxt module build passed serially; docs build passed. Nine current guide snippets passed strict final-v4 installed declarations without aliases or `skipLibCheck`. After last inherited-getter guard repair, affected devtools library/client typechecks, rebuilt artifact, full suite, browser matrix, and installed consumers were rerun successfully; full workspace types and lint had already passed with unchanged public API. See S16 for external ambient-type boundaries.
- Failure-first tests and private fault probes preserved. Source owners confirmed freeze before coordinator consolidation. No staging, commit, or push performed.
