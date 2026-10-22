# S01: package boundaries and shared protocol

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Dependencies: none.
- Contract: [overview](./00-overview.md).
- Next: [S02](./02-cache-inspection.md).

## Goal

Introduce independently buildable neutral contracts and package entries without cutting over existing consumers yet.

## File ownership

- Modify `packages/devtools/package.json`, `build.config.ts`, and `tsconfig.json`.
- Add `packages/devtools/src/protocol/{index,identity,session,views,actions,errors,schemas}.ts`; split schemas by read/action concerns if needed for 300-line limit.
- Add entries `src/{browser,vue,node,protocol}/index.ts` only when owning slice supplies implementation. Do not publish placeholder callable APIs.
- Modify catalog, lockfile, `test/utils/sourceAliases.ts`, and test tsconfig paths for exact new subpaths.
- Add `packages/devtools/test/protocol.spec.ts`, `test/exports.spec.ts`, and neutral consumer type fixtures.

No runtime registration, host mount, or UI migration in this slice.

## Contract

1. Protocol version 1. Target requires nonempty session/store IDs and positive integer generation.
2. Session summary includes kind, label, connected/completed state, started/completed timestamps, and store summaries.
3. Capability summary explicitly marks cache inspection, module observation, cache writes, backend mutations, and read-only state.
4. Cache page input includes offset and limit; clamp nothing silently. Reject negative/noninteger offset and limit outside 1–500. Default limit 100. History uses limit plus optional exclusive `beforeSequence`/`afterSequence`; reject both cursors together. No cursor selects latest retained page, returned oldest to newest.
5. Cache request includes target, collection, optional layer ID, key search, content search, and page.
6. Read reply echoes target/revision and includes unavailable/truncation metadata.
7. Data action envelope includes target, command ID, issued-at timestamp, and action-specific input. Keys accept string or finite number; empty string and zero valid.
8. Recursive input JSON accepts null, booleans, finite numbers, strings, arrays, plain own-property objects. Reject functions, preview DTOs, cycles, accessors, unsafe assignment keys, and nonfinite numbers.
9. Errors are structured at transport boundary; local argument validation uses same schemas.

Action envelope has 32 KiB encoded JSON limit, depth 10, and 1,000 visited entries. Issue time allows 30 seconds of future skew and five minutes of replay. Cache reply includes `scanTruncated` and nullable matching total; readers scan at most 10,000 candidate rows. Incomplete scan cannot claim globally complete ordering/filter results.

Use Valibot for shared Standard Schema definitions. Do not use Devframe's deliberately minimal internal schema builder.

## Implementation steps

1. Record current status and build/type baseline before changing manifest.
2. Add exact paired Devframe/agentic 1.2.2 catalog entries and CAC/Valibot entries. Use dependency installation without automatic source-writing hooks when updating lockfile.
3. Add runtime dependencies only where final imports require them: shared/Core and validators for neutral runtime; agentic/CAC for node CLI; optional Vue peer. Keep UI toolchain in dev dependencies.
4. Define types from schemas, with JSDoc documenting units, limits, and authoritative side.
5. Keep legacy root component/types until S16; new implementation can be exported additively during series.
6. Configure unbuild explicit entries, ESM declarations, packaged SPA directory, and eventual bin path. Add bin when implementation exists.
7. Add exact source aliases before root aliases, matching existing test conventions.
8. Add protocol examples to this document's implementation receipt only after compiling them.

## Tests first

- Validate real argument schemas with zero/empty keys, malformed identity, invalid pagination, preview payload misuse, nested invalid JSON, and missing CRUD fields.
- Validate action envelopes distinguish cache and backend operations.
- Import neutral protocol under Node with no window/document; verify public type fixture compiles without Vue/Nuxt type loading.
- Verify package export conditions/declarations, not private file ordering or implementation strings.
- Avoid tests for every trivial type or export constant.

## Validation

- `pnpm exec vitest run --project unit packages/devtools/test/protocol.spec.ts packages/devtools/test/exports.spec.ts`
- `pnpm --filter @rstore/devtools test:types` after adding suitable library tsconfig.
- `pnpm --filter @rstore/devtools build` with current legacy SPA still buildable.
- Build/type errors from untouched legacy UI remain baseline findings, not silently ignored.

## Exit gate

Shared schemas compile; neutral entries import without framework globals. Existing consumers remain usable until cutover. New entries do not imply implementation already exists.

## Receipt

- Protocol files changed: `src/protocol/{index,identity,session,views,actions,errors,json,schemas,replies}.ts`; S03 owns `src/protocol/preview.ts`. Package configuration and exports remain coordinator ownership.
- Tests introduced: `packages/devtools/test/protocol.spec.ts`. Exercises exact keys/targets, strict pagination/history cursors, CRUD fields, no-getter JSON validation, preview/prototype/cycle rejection, and depth/entry/UTF-8 budgets.
- Test boundary: real shared Valibot schemas; no substituted application logic. Plausible defects are accepting stale generation zero, clamping pages, evaluating accessors, and permitting executable/over-budget payloads.
- Failing tests observed: initial execution failed during dependency setup (`valibot` absent), so this proves test-first order, not behavioral failure sensitivity. Coordinator installs dependencies and runs serialized validation.
- Validation: coordinator focused run passed protocol tests; isolated neutral `tsc --noEmit --strict --noUncheckedIndexedAccess --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler packages/devtools/src/protocol/index.ts` passed with direct Node 26.2.0 (mise shim fails read-only setup). Private `/tmp/rstore-protocol-fault-probe` snapshot passed 5 tests, removing `constructor` rejection failed exact unsafe-input assertion, restoring snapshot passed 5 tests again. Shared checkout was never fault-mutated.
- Limitations: timestamps use epoch milliseconds; executor enforces temporal replay bounds. JSON action input rejects recognized preview DTO shapes such as `{kind:'date',value:...}`; ordinary similarly-shaped application objects must be edited into supported plain data shape. Action source object own-key enumeration uses JavaScript platform enumeration before bounded value traversal.
- Reply validation follow-up: shared `ReadResultSchemas` and `validateReadResult(method, input, expectedTarget?)` validate all six actual view DTOs and discovery arrays, count/revision/pagination/preview metadata, bounded 512 KiB encoded reply, accessors, and mismatched target identity. Optional undefined object fields from in-memory runtime replies are omitted for byte accounting as JSON transport does. Parser does not alter capability/read-only policy. Malformed reply and real Core runtime all-view tests passed in final focused/aggregate runs. Neutral strict protocol typecheck passes.
- JSON traversal follow-up: enumerate own keys once to reject excessive/symbol keys, then inspect individual descriptors lazily; no full descriptor object allocation. Bounded action acceptance unchanged.
- Reply fault probe: private snapshot ran seven pure schema tests successfully; removing generation comparison in `validateReadResult` failed exact stale-target assertion; restoring comparison passed seven tests. Real Core all-view test remains separate coordinator-run integration of producer DTOs with schemas. Additive optional history entry/page `truncated` fields preserve projection and page-byte omission metadata.
- Shared observation contracts: `observation.ts` exports exact-target `WatchRequestSchema`, shared `ViewSchema`, and `RuntimeInvalidationSchema` including target-optional registry changes. Browser transports extend shared watch entries with their own lease identifiers. Current owned sources and protocol test pass repository ESLint; strict neutral protocol typecheck passes; current private pure-schema snapshot passes eight tests after lint cleanup. Full suite contains ninth actual-Core runtime test for coordinator validation.
- SSR discovery metadata: `SessionRequestSchema` / `SessionRequest` now define optional SSR-only `SessionSummary.request`, including safe path/method, active or terminal status, epoch timestamps, elapsed duration, and projected error. Completed/error/aborted statuses require terminal timing fields; raw errors, query/fragment/control characters, overlong path/method, and negative duration reject. Test-first active SSR discovery failed with `Invalid read reply` before schema implementation; private pure snapshot now passes nine tests. Scoped ESLint and strict neutral typecheck pass. SSR owner reuses shared type for retained requests; runtime/inspector owners handle active publication and empty-store failed initialization display.

## Final coordinator acceptance

- Slice evidence: Installed public entries/declarations, optional Vue/Vite peers, executable CLI, and packaged assets verified outside workspace aliases. Neutral root/protocol and actual Core consumer imported/compiled without Vue, Nuxt, Vite, DOM globals, or DOM ambient libraries. Shared schemas validated actual Core replies and SSR metadata.
- Final aggregate gates: `pnpm test` passed 267 files / 1,980 tests; one distribution file / four cases conditionally skipped in default run, then all four passed against final v4 tarballs outside monorepo. Final headless browser matrix passed 13 cases in 6.9 seconds. Seven real Nuxt boot files passed, including final SSR lifecycle/privacy and browser/disabled/production scenarios.
- Final tooling gates: all 21 workspace typecheck scripts plus integration/browser types passed through serial `pnpm test:types`; full repository ESLint passed; shared/Core/Vue/devtools builds and Nuxt module build passed serially; docs build passed. Nine current guide snippets passed strict final-v4 installed declarations without aliases or `skipLibCheck`. After last inherited-getter guard repair, affected devtools library/client typechecks, rebuilt artifact, full suite, browser matrix, and installed consumers were rerun successfully; full workspace types and lint had already passed with unchanged public API. See S16 for external ambient-type boundaries.
- Failure-first tests and private fault probes preserved. Source owners confirmed freeze before coordinator consolidation. No staging, commit, or push performed.
