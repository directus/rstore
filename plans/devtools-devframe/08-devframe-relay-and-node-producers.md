# S08: Devframe relay and explicit Node producers

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Depends on: S01, S04, S06, S07.
- Owner: Devframe definition, producer registry, Node transport.
- Contract: [overview](./00-overview.md).

## Outcome

One Devframe relay serves registered browser/Node producers through exact authenticated owner connection. Node stores register explicitly; relay never imports application factory.

## Files

Create `packages/devtools/src/` files:

- `devframe/definition.ts`, `handlers.ts`, `producer-registry.ts`, `routing.ts`.
- `devframe/auth.ts`, `options.ts`, `paths.ts`.
- `node/index.ts`, `connect.ts`, `producer.ts`.
- `browser/relay.ts`, integrated with S07 browser factory.
- `test/relay.spec.ts`, `test/node-producer.spec.ts`, reusable `test/utils/relay.ts`.

Use pinned Devframe 1.2.2 declarations as baseline. Do not duplicate its websocket implementation or RPC dispatcher.

## Devframe integration

Export `createRstoreDevframe(options)` from Node entry. Definition contains validated public read/action RPCs and private producer registration/event RPCs. Public catalog maps one-to-one to overview; agent metadata added S15. Private producer methods have no agent exposure.

Use `ctx.rpc.getCurrentRpcSession()` inside registration handler to capture current `{ meta, rpc }`. Route producer operations directly through captured owner RPC handle. Do not broadcast store actions or select by peer display name. Use `onPeerConnect`/`onPeerDisconnect` for connection lifecycle.

Accept only producers with valid protocol handshake, allowed producer role, authenticated session, and unique live identity. Browser and Node connection roles differ from viewer; viewer cannot impersonate producer by calling private registration. Role/permissions are server-owned after credential validation, never trusted from client metadata alone.

Server registry retains metadata and bounded detached data, not store objects or RPC handles after disconnect. Programmatic `runtime` option exposes local Node runtime via same dispatcher without transport round trip.

## Reconnect ownership

Registry key is session ID, then logical store ID/generation. A connected duplicate producer session from different owner is conflict. After owner disconnect, reconnect from authorized producer can claim same session and atomically advance connection epoch.

Every routed call captures owner, target generation, and epoch. Before returning/applying result, verify captured owner still current. Disconnect callbacks remove only matching epoch. Late callback from old socket cannot delete new registration. A replaced connection does not grant access to stale generation.

Disconnected live data becomes unavailable; retain only clearly labelled bounded metadata required to show disconnected session until retention expires. Never silently present old snapshot as current live read. SSR retention is separate S14 policy.

## Node connection

`connectRstoreDevtools(runtime, { baseURL, authToken })` uses official `createRpcClient` and websocket channel imports. Node >=26 supplies native WebSocket; do not ship browser shim in root entry.

Validate URL, normalize base path once, and use Devframe's actual RPC route from installed declarations. Producer endpoint implements shared bounded handlers. Return disposer that unregisters/cleans connection; runtime ownership stays with caller unless explicit factory option owns it.

Reconnect uses bounded exponential backoff with cancellation and same process session ID. Authentication/protocol rejection is terminal until configuration changes. Reconnection does not replay unknown commands. Disconnect during action returns unknown outcome if dispatch was possible.

## Host/auth rules

Normalize configurable base path; default `/__rstore`. Server binds loopback by default. External binding requires explicit host/allowed origins configuration.

Keep asset URL, relay URL, allowed viewer origins, and producer auth distinct. Node producer token comes from explicit option or documented environment in CLI wrapper. Do not emit token in logs, URLs, DTO metadata, or public Nuxt config.

Interactive client authentication uses Devframe supported `clientAuthTokens`. Allocate distinct server-owned credentials/roles for browser producer, viewer, and private SSR producer. Validate Origin where available; Node clients use explicit authentication rather than fabricated browser origin.

HTTP MCP policy is defined S15; relay must expose no unauthenticated HTTP write path accidentally. Prefer Devframe standard handler for HTTP/websocket lifecycle, reuse upstream auth hooks where supported. Any extra role check wraps shared dispatch once.

## Tests first

- Start real local relay; register actual direct Core store from Node; viewer lists/read/writes it.
- Browser and Node sessions with same logical store ID remain separate.
- Wrong token, viewer-as-producer, wrong protocol, duplicate active identity reject.
- Reconnect old disconnect/result cannot affect replacement epoch.
- Disposal closes sockets/backoff timers and removes live registrations.
- Action on disconnected/replaced generation fails; no broadcast or fallback.
- Subpath base URLs work; origin allowlist rejects unrelated site.
- Runtime Node import works without DOM/Vue.
- Secrets absent from summaries and diagnostic errors.

Tests use allocated ports, deterministic cleanup, and bounded deadlines; no fixed port3300.

## Exit gate

Real Core Node producer connects, reads, mutates, disconnects, and reconnects through pinned Devframe APIs. Ownership and auth failures are verified beyond mocked RPC.

## Implementation receipt

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Changed files: `src/devframe/{definition,handlers,producer-registry,routing,auth,options,paths,assets,host,watch}.ts`, `src/node/{index,connect,producer,rpc}.ts`, `src/browser/relay.ts`, `test/{relay,node-producer}.spec.ts`, shared `test/utils/relay.ts`.
- Tests introduced: real allocated Devframe relay with actual direct Core/cache stores; two identical logical store IDs route independently; wrong credentials, viewer producer impersonation, incompatible protocol and simultaneous duplicate ownership reject; disconnected producer reconnects without command replay; remote Core Modules observation starts and stops with viewer lease. Real post-authentication registration socket loss followed by server restart at same allocated origin recovers automatically. Concurrent 101 observation requests admit exactly 100; producer disconnect frees full viewer quota. Pure authority checks protect old epochs, completed SSR identities, disconnected producer kinds and reserved local identity.
- Test-first evidence: initial relay scenarios authored before Node/relay source existed. Remote Modules scenario failed with `Modules observation: 0 viewer events, 1 runtime revisions`, exposing Devframe's fresh per-call session wrapper; fixed peer matching to stable metadata plus RPC handle. Retry classification scenario exposed upstream Error cloning dropping custom fields; private registration now preserves structured denial codes in JSON outcome. No isolated mutation fault probe claimed.
- Commands and results: `pnpm exec vitest run packages/devtools/test/relay.spec.ts packages/devtools/test/node-producer.spec.ts --project unit` passed 9 tests in 1.51 seconds with real allocated loopback ports. Exact stale-target/unavailable error codes survive wire; stale delete leaves replacement cache intact. Final two-runtime detach regression failed before fix (`expected [1,1] to deeply equal [0,1]`); per-session observation cleanup now releases first runtime immediately, preserves second runtime reads, and recovers viewer quota without closing shared socket. Owned ESLint passed after scoped fixes. Root previously reported actual SDK HTTP MCP tests and full library/SPA build passing; final aggregate build/browser checks tracked S16. `git diff --check` on owned paths passed.
- Real relay evidence: official Devframe `initDevframe` middleware, native Node WebSocket, official discovery URL resolver and RPC channel/client execute same Core/cache/action handlers used by local inspector. No wire/server dispatcher doubles.
- Auth/lifecycle: distinct server-owned viewer/browser/node/SSR roles; separate HTTP MCP bearer; target-generation/connection-owner fences; terminal structured authentication/configuration rejection and retryable transport loss; bounded reconnect; idempotent connection/server disposal. Role token travels only in authentication frame, absent from WebSocket upgrade URL. HTTP MCP absent bearer disables endpoint and emits one process hint. Cross-origin public descriptor bootstrap enables upstream viewer-origin registration without exposing role credentials or widening data RPC CORS.
- Limitations / follow-up: final package declaration/client build and hostile browser Origin proof belong S16 shared acceptance. Old-owner response injection sensitivity not separately fault-probed. S14 supplies bounded immutable SSR worker/ledger publication through same authenticated connection.

## Final coordinator acceptance

- Slice evidence: Real Devframe HTTP/WebSocket relay, exact producer ownership, reconnect, stale replies/disconnects, role denial, per-session detach cleanup, and shared-socket surviving runtime passed. Real SDK MCP and installed-package checks exercised same relay/runtime handlers.
- Final aggregate gates: `pnpm test` passed 267 files / 1,980 tests; one distribution file / four cases conditionally skipped in default run, then all four passed against final v4 tarballs outside monorepo. Final headless browser matrix passed 13 cases in 6.9 seconds. Seven real Nuxt boot files passed, including final SSR lifecycle/privacy and browser/disabled/production scenarios.
- Final tooling gates: all 21 workspace typecheck scripts plus integration/browser types passed through serial `pnpm test:types`; full repository ESLint passed; shared/Core/Vue/devtools builds and Nuxt module build passed serially; docs build passed. Nine current guide snippets passed strict final-v4 installed declarations without aliases or `skipLibCheck`. After last inherited-getter guard repair, affected devtools library/client typechecks, rebuilt artifact, full suite, browser matrix, and installed consumers were rerun successfully; full workspace types and lint had already passed with unchanged public API. See S16 for external ambient-type boundaries.
- Failure-first tests and private fault probes preserved. Source owners confirmed freeze before coordinator consolidation. No staging, commit, or push performed.
