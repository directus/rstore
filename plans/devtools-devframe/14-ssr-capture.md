# S14: automatic bounded SSR capture

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Depends on: S03, S04, S08, S13.
- Owner: request-scoped capture and detached retention.
- Contract: [overview](./00-overview.md).

## Outcome

Nuxt development requests appear as separate read-only SSR sessions. Active requests can be inspected; completed/error/aborted requests retain bounded detached snapshots without request/store references.

## Files

- Create `packages/devtools/src/ssr/types.ts`, `snapshot.ts`, `retention.ts`, `error.ts`.
- Extend relay producer registry/handlers with validated SSR snapshot publication.
- Create `packages/nuxt/src/runtime/devtools/server.ts`, `request.ts`, `nitro.ts`.
- Update module private config, Nitro plugin registration, and runtime store bootstrap.
- Create `packages/devtools/test/ssr-retention.spec.ts`.
- Create `packages/nuxt/test/nuxt-boot/devtools-ssr.spec.ts`; add explicit serialized project entry.
- Extend real Nuxt browser fixture for SSR session browsing.

No dependency on request framework enters portable runtime/protocol.

## Request identity and lifecycle

Create random session ID per request, kind `ssr`, registration ID `default`, readOnly true. Never use process-global store registry as request identity.

Associate runtime/store/capture handle with actual Nuxt SSR event using WeakMap or event context. Active handle exists only until finalize; SSR worker connection is separate process-owned resource. Concurrent requests own different runtimes and histories.

Bind runtime plugin before actual store creation. Active inspection can route through worker to request handle while request remains active. Every action rejects even before render completes.

Successful `app:rendered` captures detached bounded DTO snapshot while store available. Nitro `afterResponse`/error/abort finalization always disposes request runtime and store-observer handles once. If rendered hook never runs, finalizer captures available bounded sections with status error/aborted and useful projected error. Inspect installed Nuxt/Nitro lifecycle signatures before wiring; do not assume all errors trigger same hook.

Finalize is idempotent. An earlier rendered snapshot can be published once and updated only with terminal metadata without traversing disposed store. Failed store initialization still records request status if bounded metadata available.

## Snapshot budget

Capture Collections, Cache, History, Subscriptions, Modules, Plugins using shared read/projection handlers with one cumulative 512 KiB encoded budget. Preserve actual keys, revisions, unavailable sections, and truncation markers.

Never materialize unrestricted cache/all modules then slice resulting JSON. Traverse within remaining byte/entry budgets; stop/mark truncation. No connector fetches. Snapshot owns detached values and metadata only.

Metadata includes random session identity, path without query secrets, method, started/completed time, duration, terminal status, and capture limits. Exclude headers, cookies, authorization, full URL query, raw request, and arbitrary Nuxt payload.

Retain newest 50 completed records for five minutes from completion, maximum32 MiB aggregate. Evict oldest completed first. Active request metadata has separate bounded admission; use maximum50 concurrently inspectable handles, drop capture for excess with bounded counter rather than disrupt request execution. Active requests are never evicted by deleting app-owned stores.

TTL/index housekeeping has one relay-owned timer, disposed on shutdown. Ledger retains no store/runtime/request/closure after completion. Page reads operate on snapshots; no replay into live store.

## Worker connection and private auth

Generate distinct SSR producer credential during Nuxt dev setup. Store only in private Nitro runtime configuration. Relay validates it as server-producer role; it is not HTTP MCP bearer or browser client token.

Configure actual loopback relay origin from dev host startup/discovery, including dynamic port/base. Avoid reading browser `location`, guessing3300, or opening per-request sockets. One worker-owned Node producer connection publishes active metadata and completed snapshots; worker map dispatches read by exact request target.

If relay unavailable, application request must continue. Keep bounded detached publication buffer using same retention limits; no retained live request/store waiting for reconnect. Once active inspection cannot be routed, capture completion locally and dispose request resources promptly. Reconnect publishes retained snapshots, never actions.

Production disables Nitro plugin/private credential/connection/capture entirely.

## Tests first

- Real two overlapping SSR requests with different cache data remain isolated.
- Inspect active request; crafted action rejects before public store methods.
- Completed snapshot survives request runtime disposal and source mutation.
- Render error and aborted response finalize exactly once without leaked handles.
- Retention obeys count, byte, TTL limits; individual large capture stays512 KiB during traversal.
- Missing relay does not delay/fail application response; detached buffer remains bounded.
- Reconnect publishes completed records without retaining old stores or duplicating identity.
- Credential absent from HTML/payload/public runtime config, logs, and session metadata.
- Production starts no connection/capture.
- Vue observers are absent for SSR; Core runtime/store hooks still record useful events.

Use fake clock for ledger limits and real Nuxt requests for lifecycle/isolation. Heap benchmark not required; explicit map/handle lifecycle assertions and cleanup evidence suffice.

## Exit gate

Automatic active/completed SSR sessions appear in inspector, remain immutable, obey budgets, and release request resources on success/error/abort. Private auth and production exclusion verified.

## Implementation receipt

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Changed files: `packages/devtools/src/ssr/{types,retention,snapshot,error,index}.ts`, `src/node/ssr.ts`, `src/devframe/ssr-handlers.ts`; Nuxt `runtime/devtools/{request,server,nitro}.ts`; runtime plugin binding/disposal; SSR fixture and focused tests. Removed unused legacy runtime devtools export wrapper. Relay agent integrated shared worker connection, private role auth, registry retention, and Node exports. Host agent propagated private Nitro config without replacing application config.
- Tests demonstrated failing before implementation: initial capture/retention module absent; actual Nuxt returned no SSR records while private base remained unset; four wire ownership cases accepted foreign producer/view authority before guards moved; changed completed snapshot resolved before immutable identity check. No-store session discovery omitted request/error metadata; contradictory private publication resolved before metadata consistency check. Real H3 error retained header/cookie/query/payload secrets through enumerable data/cause fields before safe failure summary. Isolated count-eviction fault admitted an extra oldest record and failed exact membership assertion. No shared source was mutated for fault probe.
- Commands and results: direct Node 26 Vitest `--project unit packages/devtools/test/ssr-retention.spec.ts packages/devtools/test/ssr-relay.spec.ts` passed twelve tests, including six actual authenticated loopback scenarios. Sandbox listener denial required approved escalated execution. Direct `tsc --noEmit -p packages/devtools/tsconfig.json` and scoped ESLint passed latest source/tests. Real Nuxt `--project nuxt-boot packages/nuxt/test/nuxt-boot/devtools-ssr.spec.ts` passed both lifecycle tests against final rebuilt metadata, including parity/privacy assertions.
- Real concurrent SSR evidence: actual Nuxt 4.5.2 dev renderer handled two overlapping requests with identical key `0`, different cache titles, different random session IDs, detached terminal records, and zero active handles after response. Private config/worker presence verified. Actual failed rendering and aborted client response each retained exactly one terminal record and left zero active handles; no manual cleanup invocation supplied lifecycle proof. Error request disables ofetch GET retries so it represents one request.
- Auth/retention/cleanup evidence: live/completed actions denied; separate Node credential cannot publish SSR snapshot; connected Node/other SSR owners and foreign view session/generation denied; current owner accepted despite fresh Devframe session wrapper; identical reconnect publication accepted without TTL refresh; changed completion/path denied. Ledger verifies count/byte/TTL limits, detachment, disposal, and oversized input rejection. Shared worker caps admission at 50 and detached outage buffer at 50; one publication in flight prevents unbounded pending closures.
- Discovery metadata: active and terminal sessions expose safe path, method, timing, status and projected failure through shared `SessionRequestSchema`; no-store failed requests remain selectable. Capture and discovery metadata must match on private publication. Safe failure summary reads only descriptor name/message/HTTP status, never request, cause, headers or arbitrary payload. Final error projection budgets both serialized metadata copies within 512 KiB.
- Limitations / follow-up: SSR cache capture retains effective first-page rows only; unavailable committed/layer row queries report explicit unavailability. Rebuilt metadata parity assertions, production exclusion, browser inspector acceptance, and final package checks passed.

## Final coordinator acceptance

- Slice evidence: Final built Nuxt concurrent success/error/abort cases passed with isolated identities/data, immutable retained records, zero active handles, private credential exclusion, safe request/error metadata, and actual H3 privacy assertions. Retention/auth/ownership suites passed; no manual cleanup substitutes for lifecycle proof.
- Final aggregate gates: `pnpm test` passed 267 files / 1,980 tests; one distribution file / four cases conditionally skipped in default run, then all four passed against final v4 tarballs outside monorepo. Final headless browser matrix passed 13 cases in 6.9 seconds. Seven real Nuxt boot files passed, including final SSR lifecycle/privacy and browser/disabled/production scenarios.
- Final tooling gates: all 21 workspace typecheck scripts plus integration/browser types passed through serial `pnpm test:types`; full repository ESLint passed; shared/Core/Vue/devtools builds and Nuxt module build passed serially; docs build passed. Nine current guide snippets passed strict final-v4 installed declarations without aliases or `skipLibCheck`. After last inherited-getter guard repair, affected devtools library/client typechecks, rebuilt artifact, full suite, browser matrix, and installed consumers were rerun successfully; full workspace types and lint had already passed with unchanged public API. See S16 for external ambient-type boundaries.
- Failure-first tests and private fault probes preserved. Source owners confirmed freeze before coordinator consolidation. No staging, commit, or push performed.
