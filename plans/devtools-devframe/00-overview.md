# Devframe devtools: overview and implementation contract

- Status: verified; all sixteen slices implemented and final acceptance passed on 2026-10-08.
- Written: 2026-10-08.
- Planning checkout: `main` at `de726994`, with unrelated concurrent working changes. Implementation checkout verified at `99a0c3a4`.
- Package: `@rstore/devtools`.
- Delivery: 16 ordered slices. User subsequently authorized implementation with subagents and safe parallel ownership. Staging, commit, and push remain unauthorized.

## Outcome

One portable instrumentation runtime supports `StoreCore` and Vue stores. One Devframe definition serves embedded panels, Nuxt/Vite integrations, external viewers, explicitly registered Node stores, SSR inspection records, MCP, and standalone CLI.

Keep Collections, Cache, History, Subscriptions, Modules, and Plugins. Build inspector with Vue, Vite, and existing Nuxt UI. Clean API break after repository consumers migrate.

## Locked decisions

1. Host and store runtime independence, including Core and Vue.
2. Clean public API break; no permanent compatibility aliases.
3. Embedded, Nuxt/Vite, external-viewer, MCP, and CLI surfaces included.
4. Live development stores expose cache write/delete/clear and connector-backed collection create/update/delete by default. Explicit read-only registration supported.
5. SSR always read-only, including requests still rendering.
6. Automatic SSR capture: last 50 requests, five-minute TTL, bounded snapshots.
7. CLI receives connected producers; it does not load application store factories.
8. No arbitrary module invocation, executable inspection filters, implicit remote fetches, production capture, static reports, or new browser extension.
9. UI status and selection use subtle backgrounds. No decorative colored borders or accent edge bars.

## Planning baseline

- Devtools UI is a Nuxt-built SPA. Its client uses Nuxt DevTools host access or `window.parent.__RSTORE_DEVTOOLS__`.
- Instrumentation lives in `packages/nuxt/src/runtime/devtools/`; history uses Nuxt state.
- Cache UI reads Vue `_private.layers`. Modules expose live refs and callable objects.
- Nuxt mount hardcodes `/__rstore` and a port-3300 fallback. Playground starts separate inspector Nuxt process.
- Existing `Cache.dispose()` stops its timer but does not emit a store lifecycle hook. S02 adds that prerequisite.
- Existing `test/utils/store/realCacheStore.ts` creates a Vue store even for `createCoreStack`. S02 adds an explicit direct-Core mode; existing tests keep current default.
- Shared browser suite now lives in `test/browser/`, launched through `pnpm test:browser`. Reuse its process/display ownership and artifact handling.
- Cache still has timestamp/tombstone behavior on this checkout. This series must not extract, replace, or redesign that unrelated behavior.

These observations describe pre-cutover architecture and motivated slices below. Implementation now replaces legacy bridge, Nuxt-built inspector, private cache inspection, and subprocess fallback. Re-read touched files before changing remaining boundaries.

## Documents and order

- [S01: package and protocol](./01-package-and-protocol.md)
- [S02: cache inspection and disposal](./02-cache-inspection.md)
- [S03: value projection](./03-value-projection.md)
- [S04: runtime and instrumentation](./04-runtime-and-instrumentation.md)
- [S05: Vue adapter](./05-vue-adapter.md)
- [S06: data actions](./06-data-actions.md)
- [S07: in-page channel](./07-in-page-channel.md)
- [S08: relay and Node producers](./08-devframe-relay-and-node-producers.md)
- [S09: Vite inspector shell](./09-vite-inspector-shell.md)
- [S10: inspector read views](./10-inspector-read-views.md)
- [S11: inspector data actions](./11-inspector-data-actions.md)
- [S12: Vite and external viewers](./12-vite-and-external-viewers.md)
- [S13: Nuxt browser integration](./13-nuxt-browser-integration.md)
- [S14: SSR capture](./14-ssr-capture.md)
- [S15: MCP and CLI](./15-mcp-and-cli.md)
- [S16: cutover and acceptance](./16-cutover-and-acceptance.md)

Each slice lists dependencies and owns one implementation boundary. Follow numbered order by default. Dependencies describe technical prerequisites, not authorization to delegate work.

## Public entry points

- Root: `createRstoreDevtools`, neutral runtime/adapter/registration types.
- `/browser`: `createBrowserDevtools`.
- `/vue`: `createVueDevtoolsAdapter`, `RstoreDevtoolsPanel`.
- `/node`: `createRstoreDevframe`, `connectRstoreDevtools`.
- `/vite`: `rstoreDevtools`.
- `/protocol`: DTOs, schemas, and transport contracts.
- Binary: `rstore-devtools`.

Root/protocol runtime import graphs must not load Vue, Nuxt, DOM globals, Node serving code, or MCP SDK. `@rstore/core`, `@rstore/shared`, and `@rstore/vue` must not depend on devtools.

Keep ESM package shape. Publish separate unbuild entries and built SPA under `dist/client/`. Vue is optional peer; inspector bundles its own Vue dependencies. Node/MCP imports stay behind corresponding entries. Use Devframe and matching `@devframes/agentic` version `1.2.2`, pinned together through workspace catalog; CAC and Valibot also use catalog.

### Runtime API

`createRstoreDevtools(options?)` creates isolated registry and instrumentation. Runtime exposes:

- `plugin(options)`: return shared `Plugin`; install instrumentation synchronously, publish registration during `init`.
- `attachStore(store, options)`: attach existing `StoreCore`; return disposable registration. Capture starts at attachment, never invent past history.
- `dispose()`: idempotently detach registrations and owned resources.

Registration options require logical `id`; optional `label`, `adapter`, and `readOnly`. Default label equals ID. Nuxt uses store ID `default`.

Duplicate active ID or attaching same store twice to one runtime is an error. Replacement requires disposing old registration. Keep generation counter after removal for runtime lifetime; reused ID gets larger generation.

Adapter provides optional value unwrapping, cache reader override, and subscription-based module/layer observation. Core adapter does not import Vue. Missing cache inspection capability reports unavailable rather than falling back to private fields.

`createBrowserDevtools` adds in-page endpoint and optional relay to same runtime. `relay: false` supports browser-only inspection. Relay configuration uses `baseURL`; separate from panel asset URL.

`connectRstoreDevtools(runtime, { baseURL, authToken })` connects explicit Node producer to existing relay and returns disposable connection. Programmatic local Node runtime can instead be passed to `createRstoreDevframe({ runtime })`.

### Target ownership

All store operations require `{ sessionId, storeId, generation }`. Session kind is `browser`, `node`, or `ssr`.

Browser page runtime receives fresh random session ID on bootstrap. Reload creates new session; transport reconnect inside same runtime retains identity. SSR request receives fresh ID; Node process runtime receives fresh ID. Labels may stay stable without reusing authority.

Relay binds producer to authenticated Devframe RPC session and owner RPC handle. Reconnection atomically replaces disconnected owner for same producer identity and advances connection epoch. Old disconnect callbacks or responses cannot affect replacement owner.

Viewer selection owns request epoch. Late data may update neither new target nor new tab. No fallback to first writable store for an action.

## Protocol and projection

Protocol version is `1`; handshake rejects incompatible version. Both sides import same definitions; no handwritten duplicate request guards.

DTOs contain session/store summaries, capabilities, tab revisions, collection descriptions, paged cache rows, layers, history, subscriptions, modules, and plugin descriptions.

Key values preserve public `string | number` form. Dates/times in ordinary protocol fields use epoch milliseconds. Inspector values use explicit preview union, described in S03. Plain JSON action inputs are distinct from preview DTOs.

Read replies include target and relevant revision. Live data is never `static` RPC or indefinitely cached. Invalidation coalesces per tick; fetch selected view on demand. Replies include truncation/unavailable information rather than presenting incomplete snapshots as complete.

Public RPC IDs:

- `rstore:list-sessions`, `rstore:list-stores`
- `rstore:get-collections`, `rstore:get-cache`, `rstore:get-history`
- `rstore:get-subscriptions`, `rstore:get-modules`, `rstore:get-plugins`
- `rstore:clear-history`
- `rstore:write-cache-item`, `rstore:delete-cache-item`, `rstore:clear-cache`
- `rstore:create-item`, `rstore:update-item`, `rstore:delete-item`

Producer registration/publication/dispatch methods are internal and have no agent metadata. Shared schemas validate arguments for local transports, in-page handlers, RPC, and MCP.

Errors use `{ code, message, target?, commandId?, outcome? }`. Codes distinguish invalid arguments, missing/read-only/unavailable/stale target, unavailable capability, protocol mismatch, capacity, backend failure, and unknown action outcome. Preserve meaningful backend error messages; project error details without credentials.

## Actions and retry rules

Cache actions call public `writeItem`, `deleteItem`, and `clear`. Backend actions call Core `createItem`, `updateItem`, and `deleteItem`. Backend success means normal connector operation succeeded, not an invented durability guarantee.

Actions require `commandId` and `issuedAt`. Five-minute command window; 1,000 records per registration. Do not evict unexpired/pending records to admit new commands: return capacity error. Expired envelopes rejected; pending records retain outcome until settlement. Deduplication is bounded to window and registration generation, not durable exactly-once across process loss.

Matching duplicate returns same pending/completed outcome; different payload with reused ID rejected. Retry after uncertain outcome is never automatic. Reconnect republishes state rather than replays commands.

Cache APIs return acceptance before paused/staggered writes become visible. Result distinguishes `accepted` from `completed`; committed cache hooks advance cache revision. Inspector never resumes application-owned paused cache.

## Limits and behavior defaults

- Hosted base `/__rstore/`; standalone base `/`.
- History: newest 1,000 entries and 4 MiB per registration, whichever limit reached first.
- Pages: 100 default, 500 maximum.
- Cache scan: at most 10,000 candidate rows per read. Apply filters and sort within bounded candidate set; report `scanTruncated` and unknown matching total if more rows exist. Exact collection count comes from cache metadata, not sampled matches.
- Action input: 32 KiB encoded JSON envelope; at most depth 10 and 1,000 visited entries. Issue time permits 30 seconds of future clock skew; older than five minutes or further in future is rejected.
- Value preview: 32 KiB encoded JSON, depth 10, at most 1,000 visited entries, string 8 KiB. Limits checked while traversing, not after unrestricted serialization.
- Tab reply/snapshot: 512 KiB total; include truncation and continuation where paging supports it.
- Completed SSR snapshot: 512 KiB, including all captured sections.
- Completed SSR records: 50, five-minute TTL measured from completion, 32 MiB aggregate.
- History uses monotonic sequence IDs even after evictions/clear. Page ordering oldest to newest; request latest page for initial history view.
- Collection/cache keys sort deterministically by string form then type. Key and content filters apply before pagination; no implicit connector fetch.
- Core module polling: 250 ms while Modules view subscribed; Vue uses scoped watchers.
- Inspection call timeout 10 seconds; action 30 seconds; neither triggers automatic writes.

SSR snapshot memory budget is independent of live producer histories. Evict oldest completed SSR records first. Byte counts use encoded detached DTOs; functions/store/request objects are never retained in snapshot ledger.

## Hosting and authentication

Use Devframe standard handler and connection discovery; do not create independent RPC framing or WebSocket server.

Standalone/Vite bind loopback by default. Browser relay uses Devframe trust flow; browser-only in-page endpoint uses Devframe origin/ancestor handshake. HTTP MCP requires `DEVFRAME_MCP_AUTH_TOKEN` because data actions are present; without it HTTP MCP is disabled, with one concise setup hint. Stdio MCP remains available under parent process ownership.

SSR producer credential is separate from MCP bearer. Generate during Nuxt dev setup, put only in private Nitro configuration, and authorize through relay auth. Never serialize credentials into browser payload, public runtime config, ordinary connection metadata, logs, or artifacts.

External-origin viewer connection uses Devframe viewer-origin registration and trust, not unrestricted CORS. Same-origin standalone tab needs no special origin widening.

## Validation and implementation receipts

Every slice writes useful failing behavior tests first, then implements. For schema/serializer units, pure inputs suffice. Application/store actions need real Core/cache/backend paths. Relay/MCP acceptance needs actual transports, not mocks of code under test.

Use existing shared store factories and browser runner. A direct-Core store backed by existing Vue cache proves Core API compatibility; neutral import-graph checks independently prove no Vue import in inspector runtime. Do not claim a new framework-neutral cache engine.

Verify focused packages per slice. S16 runs full matrix, broad tests/types/lint/docs, package contents, production exclusion, and resource cleanup. Run builds and broad tests serially; record environment/baseline failures separately.

Source modules below 300 lines; documentation can exceed that limit. Add JSDoc to public APIs, helpers, classes, and properties. Review duplication and test usefulness before completing slice.

Receipt template:

- Status: planned / in progress / verified / partial.
- Files changed:
- Tests introduced and meaningful failure observed:
- Commands and results:
- Browser/MCP/manual evidence:
- Known limitations:
- Follow-up prerequisites:

No slice completed based solely on build success.

## Implementation and acceptance status

All sixteen slices implemented and verified. Historical slice receipts preserve initial failures, isolated fault probes, fixes, and focused proof; their final coordinator sections record completed aggregate gates.

- S01–S03: public package entries/protocol, lazy public cache inspection/disposal, bounded detached projection. Existing cache publication/under-load regressions repaired; final cache focus passed 16 suites / 85 tests.
- S04–S08: Core runtime/instrumentation, Vue observation, shared actions, actual iframe channel, authenticated relay/Node producers. Exact target/generation, bounded scans/history/batches, disposal faults, offline queue acceptance, replay isolation, reconnect/detach ownership, and stale wire errors verified.
- S09–S11: built Vue/Vite inspector, six views, safe previews, explicit actions, independent viewers, stale selection/response ownership, in-memory auth/OTP, and retained/session-only SSR presentation verified in actual browser.
- S12–S14: Vite development host, Nuxt automatic browser/hydration integration, private SSR capture/retention, request/error privacy, success/error/abort cleanup, disabled/production exclusion, and sidecar/shared-host boundaries verified.
- S15: real HTTP SDK and spawned connected stdio MCP, standalone CLI, role auth, packaged assets, and owned-process cleanup verified.
- S16: legacy API/build/global/subprocess cutover, current guide/migration/navigation, distribution/example fixtures, and final matrix accepted. Detailed proof and public type boundaries recorded in [S16 receipt](./16-cutover-and-acceptance.md#implementation-receipt).

Final aggregate gates reported by coordinator:

- `pnpm test`: 267 files / 1,980 tests passed; one distribution file / four cases conditionally skipped because installed consumer roots are supplied separately. Explicit final-v4 installed-package run passed all four cases in 4.81 seconds, closing those conditional gates.
- Actual headless browser matrix: thirteen cases passed in 6.9 seconds, including retained SSR after cache disposal and failed requests without captured store authority.
- All seven real Nuxt boot files passed, including current SSR metadata/privacy and automatic browser/hydration/reload/inspector/cleanup plus disabled/production scenarios.
- `pnpm test:types`: all 21 workspace scripts plus integration/browser typechecks passed after serializing declaration ownership with `--workspace-concurrency=1`.
- Full repository ESLint passed. Shared/Core/Vue/devtools library/client builds and Nuxt module build passed serially. Final `pnpm docs:build` passed in 3.95 seconds.
- Nine exact current guide TypeScript/script snippets compiled against final installed v4 tarballs with strict checking, no source aliases, and `skipLibCheck: false`.
- Last inherited Vue getter repair passed meaningful red/green regression, ten focused cases, affected library/client typechecks, and built-byte verification. Full 1,980-test suite, thirteen browser cases, and final-v4 installed checks were rerun afterward; earlier full workspace types/lint retain unchanged public API.
- Final source-size, staging-empty, and whitespace checks passed. Inert opener sentinel recorded zero unrequested browser launches; completed runners released owned processes/sockets/display.

No required acceptance gap remains. Deferred scope stays static reports, production capture, arbitrary module calls, executable filters, application-factory loading, and browser extension. Existing public Vue cache supplies real Core-cache tests; this series does not claim a new neutral cache engine. Upstream optional-host ambient type requirements are explicit in S16. No staging, commit, or push performed.

## Sources and provenance

Devframe 1.2.2 metadata/declarations inspected during original planning on 2026-10-06. Current repo facts inspected 2026-10-08. These are implementation baselines, not claims that 1.2.2 remains latest.

- [In-page channel](https://devfra.me/guide/in-page-channel)
- [RPC](https://devfra.me/guide/rpc)
- [Standard handler](https://devfra.me/adapters/initiate)
- [Client connection](https://devfra.me/guide/client)
- [Security](https://devfra.me/guide/security)
- [MCP adapter](https://devfra.me/adapters/mcp)
- [CLI adapter](https://devfra.me/adapters/cac)

Published declarations take precedence if cached documentation disagrees. In 1.2.2 RPC type is `action`; destructive classification belongs in `agent.safety`, not `type: 'destructive'`.
