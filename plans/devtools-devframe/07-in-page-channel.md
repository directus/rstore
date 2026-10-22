# S07: in-page browser channel

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Depends on: S01, S04, S05, S06.
- Owner: browser transport independent from Nuxt.
- Contract: [overview](./00-overview.md).

## Outcome

Panel communicates with browser producer through authenticated, scoped channel. No live store/ref/function crosses iframe boundary. `relay: false` supports local inspection without server.

## Files

- Create `packages/devtools/src/browser/index.ts`, `runtime.ts`, `channel.ts`, `handshake.ts`, `lifecycle.ts`.
- Create client counterpart `packages/devtools/app/transport/in-page.ts`.
- Create `packages/devtools/test/browser-channel.spec.ts`.
- Add shared browser fixture `test/browser/fixtures/devtools.ts`, driver `test/browser/devtoolsDriver.ts`, and `test/browser/devtoolsChannel.spec.ts`.
- Add fixture route/aliases to existing browser Vite setup additively; preserve concurrent multiplayer edits.

## Channel protocol

Use `createPageScriptChannel` and `connectPanelChannel` from `devframe/in-page-channel`; define shared `InPageChannelProtocol` once. Devframe owns versioned hello, ancestor/opener discovery, dedicated MessageChannel port, heartbeat, and re-handshake. Panel initiates hello. Do not implement second nonce handshake or independent RPC framing.

Use channel name `rstore:devtools:v1`, exact `allowedOrigins`, and explicit `targets` when panel host knows parent window. Defaults cover same-origin embedded iframe. External viewers use S08 relay trust flow; do not weaken in-page channel into unrestricted cross-origin bridge.

Declare reads as `query`, mutations as `action`, invalidations as typed events. Attach S01 argument/result schemas and S04/S06 handlers. DTOs are already detached/plain, so do not serialize live store through adapter. Configure bounded calls; apply shared dispatcher deadlines of 10 seconds for reads and 30 seconds for actions. Deadline after dispatched action yields unknown outcome, never automatic retry.

Include bootstrap session metadata and full target generation. Transport owns connection epoch; messages from prior channel cannot alter replacement. Both sides reject malformed, oversized, incompatible, or unexpected messages before dispatch.

## Lifecycle

`createBrowserDevtools({ relay: false })` creates neutral runtime plus in-page producer endpoint. Optional relay added S08. Public browser entry must not import Node/MCP.

Dispose closes ports, detaches listeners, rejects pending calls, disconnects relay if present, and disposes runtime. Integrate Vite HMR disposal only in host wrapper; neutral browser package does not assume `import.meta.hot`.

Iframe reload establishes fresh channel; old pending responses remain fenced. Browser application reload creates fresh producer session ID. One runtime can serve multiple explicit viewers; each viewer has own port/epoch and bounded subscriptions.

Direct same-page integration uses same DTO handlers and lifecycle rules; do not restore legacy window global exposing store/cache/functions.

## Tests first

Unit tests use minimal transport doubles only for malformed-message and timeout handling. Real browser fixture proves authority/lifecycle behavior:

- Same-origin iframe lists actual Core and Vue registrations, reads cache/history, performs real cache action.
- Wrong source/origin or incompatible protocol never gets usable channel.
- Disposed iframe/runtime rejects pending requests and stops invalidations.
- Reload/reconnect cannot apply delayed old result to new selection.
- Browser-only mode performs all supported operations with no relay request.
- Multiple panels remain independent; disposing one does not disconnect other.
- Oversized/malformed action does not reach public store method.

Reuse shared browser runner/process/display infrastructure. Run `pnpm test:browser devtoolsChannel --project headless`; do not start separate Xvfb or new Playwright config.

## Implementation sequence

Write DTO dispatch unit tests, then browser authority fixture. Wrap Devframe endpoint creation, declared functions/events, subscriptions, and disposal in separate small files. Reuse protocol schemas; leave handshake and port framing to Devframe.

## Exit gate

Browser producer works with no Nuxt/relay dependency. Real iframe reads and writes through scoped DTO channel; stale and unauthorized sources fail.

## Implementation receipt

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Changed files: `src/browser/{index,runtime,channel,protocol,panel,dispatch,handshake}.ts`; `test/browser-channel.spec.ts`; `test/browser/{fixtures/devtools,devtoolsDriver,devtoolsChannel.spec}.ts`. Relay wrapper remains S08 ownership; inspector transport remains S09 ownership.
- Tests demonstrated failing before implementation: malformed action scenario initially lost `INVALID_ARGUMENTS` through birpc error serialization. Test failed against required structured error, then passed after shared-schema validation before dispatch plus receiver enforcement. No tests replace owned runtime/action handlers.
- Integration regression: actual two-viewer SPA replacement exposed dropped registry events. Runtime's detached callback supplied `target: undefined`; Devframe's JSON event guard rejected it. New actual-MessagePort assertion received zero registry events before fix, then exact revisions 2/3 after producer omitted absent target. Existing actual iframe replacement test now requires exact registry revisions 3/4 as well. Inspector owner subsequently confirmed actual built-SPA replacement passes: two viewers converge on writes, closing one preserves other, replacement clears old selection, and deliberate reselection reads retained cache. All 12 dedicated headless browser scenarios passed during that acceptance run.
- Commands and results: direct Node 26 Vitest runs both Vue/channel files: eight tests pass, four channel cases. Scoped ESLint passes. Real browser runner with `RSTORE_BROWSER_PORT=4187`, `devtoolsChannel --project headless`: three tests pass. Initial sandbox loopback listen failure required approved test-run escalation; runner then completed and cleaned owned resources.
- Browser evidence: separate same-origin iframe discovers actual Core and Vue stores, writes exact Core cache target, preserves Vue rows, and makes no relay request. Denied configured origin gets no usable channel. Closing one viewer preserves another; real Vue module lease invalidates; reused store ID rejects old generation.
- MessagePort evidence: actual Node MessagePorts use official Devframe endpoints. Held simulated remote command rejects with `UNKNOWN_OUTCOME` when its panel closes; surviving panel still reads, backend completes once, and command is never replayed. This proves application behavior against shared stateful remote fixture, not live service persistence.
- Limitations / follow-up: abandoned per-panel observation leases expire after 30 seconds if another viewer survives, and release immediately on final peer disconnect. Bounded caller/producer deadlines do not cancel already dispatched connector work. Full browser reload/late-selection fencing and built inspector rendering are covered by S09–S12/S16. No isolated fault-injection claim; observed before-fix schema failure is recorded above.

## Final coordinator acceptance

- Slice evidence: Actual same-origin iframe/Core/Vue channel, denied origin, independent viewers, module invalidation, stale generation, and cleanup passed. Browser-only cases made no relay requests; final built inspector used official Devframe channel.
- Final aggregate gates: `pnpm test` passed 267 files / 1,980 tests; one distribution file / four cases conditionally skipped in default run, then all four passed against final v4 tarballs outside monorepo. Final headless browser matrix passed 13 cases in 6.9 seconds. Seven real Nuxt boot files passed, including final SSR lifecycle/privacy and browser/disabled/production scenarios.
- Final tooling gates: all 21 workspace typecheck scripts plus integration/browser types passed through serial `pnpm test:types`; full repository ESLint passed; shared/Core/Vue/devtools builds and Nuxt module build passed serially; docs build passed. Nine current guide snippets passed strict final-v4 installed declarations without aliases or `skipLibCheck`. After last inherited-getter guard repair, affected devtools library/client typechecks, rebuilt artifact, full suite, browser matrix, and installed consumers were rerun successfully; full workspace types and lint had already passed with unchanged public API. See S16 for external ambient-type boundaries.
- Failure-first tests and private fault probes preserved. Source owners confirmed freeze before coordinator consolidation. No staging, commit, or push performed.
