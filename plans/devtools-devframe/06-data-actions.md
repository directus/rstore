# S06: validated cache and collection actions

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Depends on: S01–S05.
- Owner: one shared action executor.
- Contract: [overview](./00-overview.md).

## Outcome

All hosts execute identical bounded, validated actions against exact live target. Development writes default on; read-only and SSR targets reject actions.

## Files

- Create `packages/devtools/src/actions/index.ts`, `execute.ts`, `validation.ts`, `commands.ts`, `cache.ts`, `collections.ts`.
- Extend shared protocol action/result schemas from S01.
- Create `packages/devtools/test/actions.spec.ts`, `test/command-deduplication.spec.ts`.
- Reuse real-cache factory and existing connector fixture/stubs.

## Supported operations

- `clear-history`: clear this registration history; preserve event sequence.
- `write-cache-item`: validated plain JSON item, known collection; derive key through collection's actual `getKey`.
- `delete-cache-item`: explicit string/finite-number key; distinguish zero and empty string.
- `clear-cache`: exact target cache through public method.
- `create-item`, `update-item`, `delete-item`: public collection methods and real mutation pipeline.

Inspect current method signatures before mapping payloads. Do not implement actions by assigning cache internals, mutating DTOs, or calling connector directly. Connector mutations must preserve existing optimistic, queue, offline, and hook behavior.

Update/delete receive explicit collection and key. Preserve key identity; do not merge unrelated key fields into update payload. Validate payload against JSON/schema and collection capability. Runtime reports unsupported operation if public method/capability is missing.

## Execution contract

Validate protocol, envelope, target, registration activity, read-only state, capability, and payload before dispatch. Repeat activity check immediately before operation starts, including after queue/dedup resolution. Never select a substitute store.

Inputs are plain JSON, distinct from projected previews. Reject preview tags, dangerous prototype keys, accessors, cycles, nonfinite numbers, over-budget text, and executable filters. UI validates for feedback; server/runtime remains authority.

Return explicit result with command ID, target, operation, completion/acceptance state, bounded projected result, and revisions. If existing offline queue accepts work, report accepted/queued; do not claim remote backend commit. No action resumes paused cache or retries failed connector work automatically.

Errors preserve useful bounded backend message but exclude tokens/stack secrets by default. Schema failures cannot reach store methods. Read-only check applies to every action, including diagnostic clear-history; SSR records remain immutable.

## Command deduplication

Command envelope includes `commandId` and `issuedAt`. Scope record by full target. Five-minute valid replay window; maximum 1,000 records per registration. Validate issue time against runtime clock with 30-second future-skew tolerance; reject older than five minutes or further in future rather than extending lifetime on retry. Enforce shared 32 KiB envelope, depth 10, and 1,000-entry input limits.

Record input fingerprint with outcome promise before calling store. Duplicate ID plus same payload returns same pending/result outcome. Same ID plus different action/payload is conflict. Do not evict pending or unexpired records to accept more work; return capacity error. Expire settled records only after replay window. Pending records stay until settled; disposal detaches target and stops accepting commands.

A transport disconnect after backend dispatch can leave caller outcome unknown. Dedup handles reconnect to same live registration within window, not application reload, process restart, or durable exactly-once delivery. UI/MCP must not automatically retry unknown actions.

Define input fingerprint canonically from validated JSON without getters; reuse one utility. No per-transport dedup caches.

## Tests first

- Real public cache methods write/delete/clear; subsequent read DTO reflects actual store.
- CRUD reaches connector once and records normal hooks; connector failure remains failure.
- Queue acceptance reports queued rather than committed.
- Read-only live and SSR targets reject every action before cache/connector call.
- Unknown collection, missing capability, invalid item, and stale generation cannot dispatch.
- Same pending command arrives twice: one connector call, both receive same outcome.
- Conflicting reuse rejects; unexpired capacity rejects without eviction; expiry is bounded.
- Disposal while a command is waiting prevents undispatched work; already dispatched operation reports known/unknown truthfully.
- Detached projected result cannot mutate store.
- Dangerous input keys and preview DTO pasted as JSON cannot bypass schema.

Run focused unit tests, then relevant existing Core mutation integration tests if public-call mapping reveals behavior requiring changes. Do not alter unrelated mutation semantics to suit inspector.

## Exit gate

Every action uses shared executor and public store API. Exact target, read-only, capability, bounded input, and dedup rules pass meaningful tests.

## Implementation receipt

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Changed files: `packages/devtools/src/actions/{index,execute,validation,commands,cache,collections}.ts`; `packages/devtools/test/{actions,command-deduplication}.spec.ts`; `packages/shared/src/types/hooks/meta.ts`; minimal queued-status assignments in `packages/offline/src/plugin/mutations.ts`; browser proof in `test/browser/{devtoolsOffline.spec.ts,fixtures/devtoolsOffline.ts}`. Runtime owner wired `execute` and explicit registration ledger cleanup; Core mutation owner added optional caller-owned `meta` to public CRUD options.
- Tests demonstrated failing before implementation: root captured missing action entry before source implementation. Isolated final action snapshot under `/tmp/rstore-actions-dedup-fault` passed both replay tests; bypassing previous-command reservation failed decisive assertion: backend call count expected `1`, received `2`. Shared checkout was never faulted. Security follow-up reproduced mutable failure replay poisoning: expected `BACKEND_FAILURE`/original target, received caller-edited `READ_ONLY`/different target. Executor now returns independently detached errors to each consumer; same failed command never retries backend work.
- Commands and results: focused `pnpm exec vitest run --project unit packages/devtools/test/actions.spec.ts packages/devtools/test/command-deduplication.spec.ts` passed all 12 tests after final schema/cancellation/input ownership changes, failure replay isolation, and lint cleanup. Scoped ESLint passed action sources, both unit suites, offline metadata changes, and browser fixture/test. `pnpm test:browser devtoolsOffline --project headless` passed with actual browser `navigator.onLine`, native IndexedDB, actual offline plugin, and existing stateful remote fixture. Two actions returned accepted/queued; both queue and mirror/cache held data; remote rows stayed unchanged with no remote calls. Private-probe `pnpm exec vitest run --config /tmp/rstore-actions-dedup-fault/vitest.config.mts` passed baseline then detected dedup fault. Final combined run is recorded by root in S16.
- Limitations / follow-up: backend persistence proof uses existing external-service fixture, not a live DB. Replay protection is bounded and process-local; transport loss after dispatch may leave caller outcome unknown. Cache queue acceptance uses cache-owned public inspection metadata; custom caches lacking queue diagnostics cannot expose deferred-write status. Static reports remain outside scope.

## Final coordinator acceptance

- Slice evidence: Actual public Core connector CRUD, cache writes, typed keys, read-only rejection, deduplication/conflict/failed replay isolation, and queued offline acceptance passed. Real offline browser used native IndexedDB and actual remote fixture; no guessed durability or automatic retries.
- Final aggregate gates: `pnpm test` passed 267 files / 1,980 tests; one distribution file / four cases conditionally skipped in default run, then all four passed against final v4 tarballs outside monorepo. Final headless browser matrix passed 13 cases in 6.9 seconds. Seven real Nuxt boot files passed, including final SSR lifecycle/privacy and browser/disabled/production scenarios.
- Final tooling gates: all 21 workspace typecheck scripts plus integration/browser types passed through serial `pnpm test:types`; full repository ESLint passed; shared/Core/Vue/devtools builds and Nuxt module build passed serially; docs build passed. Nine current guide snippets passed strict final-v4 installed declarations without aliases or `skipLibCheck`. After last inherited-getter guard repair, affected devtools library/client typechecks, rebuilt artifact, full suite, browser matrix, and installed consumers were rerun successfully; full workspace types and lint had already passed with unchanged public API. See S16 for external ambient-type boundaries.
- Failure-first tests and private fault probes preserved. Source owners confirmed freeze before coordinator consolidation. No staging, commit, or push performed.
