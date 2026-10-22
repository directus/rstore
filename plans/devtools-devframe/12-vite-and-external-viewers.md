# S12: Vite integration and external viewers

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Depends on: S08–S11.
- Owner: development hosting and Vue panel wrapper.
- Contract: [overview](./00-overview.md).

## Outcome

Vite hosts built inspector and Devframe relay at configurable path. Same producer can serve embedded panel, standalone tab, and explicitly trusted external viewer.

## Files

- Replace `packages/devtools/src/vite.ts` with small public factory delegating to `src/vite/options.ts`, `server.ts`, `assets.ts`.
- Create `src/vue/RstoreDevtoolsPanel.vue` and panel types; export from Vue entry.
- Update `src/browser/runtime.ts` relay connection/bootstrap.
- Create `packages/devtools/test/vite-host.spec.ts`.
- Add `test/browser/devtoolsVite.spec.ts`; reuse shared driver and fixture.
- Extend package export/type fixtures for `/vite` and `/vue`.

## Vite API

`rstoreDevtools({ base?: '/__rstore', host?, allowedOrigins?, clientAuthTokens? })` returns development-only Vite plugin. Keep one documented option name `base`; clean-break removes old `route` helpers at S16.

Plugin mounts Devframe standard handler and built inspector assets, including websocket upgrade handling. Derive actual origin/port from listening Vite server, not config guess or hardcoded3300. Return discovery/bootstrap data without exposing private SSR credential.

Use shared S08 base-path normalizer. Asset paths stay valid under custom base and Vite application base. SPA fallback is confined to inspector routes; RPC, MCP, missing asset, and application routes cannot fall through to inspector HTML.

Resolve published `dist/client` relative to emitted entry using verified package layout. Workspace development can point to built assets explicitly. Missing build produces actionable error; no implicit nuxi inspector subprocess.

Dispose relay peers, upgrades, handlers, timers, and owned resources on Vite close/HMR restart. Repeated configureServer must not accumulate listeners.

## Panel and producer bootstrap

`RstoreDevtoolsPanel` takes explicit inspector asset URL and visibility configuration. It renders iframe, supplies known parent/source to Devframe handshake, and cleans panel resources on unmount. Runtime registration belongs to application bootstrap, not component creation.

Example final Vue/Vite app:

```ts
import { createBrowserDevtools } from '@rstore/devtools/browser'
import { createVueDevtoolsAdapter } from '@rstore/devtools/vue'

// Run only in development; resolve relay URL through host bootstrap.
const devtools = createBrowserDevtools({ baseURL: relayBaseURL })
const plugin = devtools.plugin({
  id: 'app',
  adapter: createVueDevtoolsAdapter(),
})
// Include plugin when creating store. Dispose devtools during HMR teardown.
```

Document explicit Core attachment too. Plugin integration observes from initialization; attaching existing store observes subsequent events only.

## External viewers

Standalone inspector tab connects to selected relay using official Devframe client and viewer-origin trust registration. Popup/opener in-page connection can use Devframe discovery where supported; unrelated-origin viewer uses relay.

Trust applies to exact origin and configured capability. No wildcard CORS, token in URL, or viewer registration granting producer role. Auth prompt/connection form stores credential only in memory; browser history contains no token.

Two viewers selecting different targets must not share selection/subscriptions. Closing one does not dispose producer or other viewer.

Production/preview has no relay, MCP, instrumentation bootstrap, or embedded inspector by default. Remove old build-copy helpers in S16; static report/production inspection deferred. Vite `apply: 'serve'` alone is insufficient proof; verify preview exclusion explicitly.

## Tests first

- Real Vite server loads inspector under default/custom base; application assets still work.
- Websocket relay uses actual allocated port and survives reconnect.
- Embedded and standalone viewers inspect same actual producer concurrently.
- Explicit allowed external origin connects; unregistered origin fails trust/auth.
- Closing panel leaves runtime/external viewer active; closing server cleans peers.
- Repeated server start/stop has no leaked listeners/processes.
- Production build and preview contain no inspector route/relay.
- Package-resolved client path works from packed package, not only source layout.

Run focused host tests and `pnpm test:browser devtoolsVite --project headless`. Pack/install proof can finish S16, but source-only asset path assumption is not accepted as published proof.

## Exit gate

Development Vite integration serves real inspector/relay with custom path and multiple viewers. Production exclusion and server cleanup proven.

## Implementation receipt

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Changed files: `packages/devtools/src/vite.ts`, `src/vite/{options,assets,server}.ts`, `test/vite-host.spec.ts`. Vue panel/browser runtime owned by S05/S07.
- Tests demonstrated failing before implementation: real Vite custom-base request returned application HTML instead of inspector. New restart scenario also failed when Vite returned a different server facade; lease now keys stable middleware owner and retains pre-base route order.
- Commands and results: direct Node 26 Vitest `run --project unit packages/devtools/test/vite-host.spec.ts --maxWorkers 1`, two tests passed with loopback access. Ordinary sandbox denied listening with `listen EPERM`; authorized focused run used escalation. Changed-file `git diff --check` and repository ESLint over owned host sources/tests passed.
- Browser/external-viewer evidence: actual Vite HTTP and official Devframe RPC client verified discovery, real allocated port, scoped bootstrap, denial of unregistered bootstrap origin, stale-token rejection after restart, and fresh-client read. S13 real headless Nuxt browser also authenticated standalone inspector Cache UI while independent official RPC viewer remained active; closing inspector preserved producer and other viewer. Embedded panel and explicit external-origin trust passed final separate browser acceptance.
- Production exclusion evidence: real Vite production build emitted only application `index.html`; preview served application and no JSON relay discovery. Missing inspector directory intentionally supplied to prove production/preview did not initialize host.
- Limitations / follow-up: packed-package client resolution and external browser origins passed final S16 acceptance. Workspace/published path resolution uses explicit `clientDir` or adjacent emitted `client/`, with source-checkout fallback. HTTP/2 hosts use official sidecar rather than HTTP/1 upgrade adapter. Nuxt middleware hosting also uses official sidecar because Nitro owns frontend upgrades; ordinary Vite uses shared server. HTTP MCP remains gated by `DEVFRAME_MCP_AUTH_TOKEN`.

## Final coordinator acceptance

- Slice evidence: Real Vite host/restart/custom-base tests, explicit external-origin browser trust, two viewers, independent selections, installed packaged asset resolution, and production/preview route exclusion passed. Ordinary Vite shares server; Nuxt and HTTP/2 use official sidecar.
- Final aggregate gates: `pnpm test` passed 267 files / 1,980 tests; one distribution file / four cases conditionally skipped in default run, then all four passed against final v4 tarballs outside monorepo. Final headless browser matrix passed 13 cases in 6.9 seconds. Seven real Nuxt boot files passed, including final SSR lifecycle/privacy and browser/disabled/production scenarios.
- Final tooling gates: all 21 workspace typecheck scripts plus integration/browser types passed through serial `pnpm test:types`; full repository ESLint passed; shared/Core/Vue/devtools builds and Nuxt module build passed serially; docs build passed. Nine current guide snippets passed strict final-v4 installed declarations without aliases or `skipLibCheck`. After last inherited-getter guard repair, affected devtools library/client typechecks, rebuilt artifact, full suite, browser matrix, and installed consumers were rerun successfully; full workspace types and lint had already passed with unchanged public API. See S16 for external ambient-type boundaries.
- Failure-first tests and private fault probes preserved. Source owners confirmed freeze before coordinator consolidation. No staging, commit, or push performed.
