# S03: bounded, detached value projection

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Dependencies: [S01](./01-package-and-protocol.md), [S02](./02-cache-inspection.md).
- Contract: [overview](./00-overview.md).
- Next: [S04](./04-runtime-and-instrumentation.md).

## Goal

Produce safe JSON inspection values once for all UI/transports without retaining application objects or traversing unbounded data.

## File ownership

- Add `packages/devtools/src/projection/{index,project,values,budget,errors}.ts`.
- Add preview schemas under `src/protocol/`.
- Add `packages/devtools/test/projection.spec.ts`.
- No Vue imports; S05 supplies adapter unwrapping callback.

## Preview representation

Scalar JSON values remain scalar. Every composite/special preview has explicit `kind`:

- `object`: own data entries as ordered key/value pairs.
- `array`: ordered values.
- `date`: ISO string, or invalid-date marker.
- `map` / `set`: projected ordered entries.
- `bigint`: decimal text.
- `function`: display-only source text when available.
- `error`: name/message and bounded data-property details.
- `reference`: prior traversal path.
- `accessor`, `unsupported`, and `truncated`: reason/path.

Wrapping all objects prevents an ordinary application `kind` property being mistaken for protocol metadata. Function previews contain bounded display names; full source capture is omitted to avoid unrestricted native source-string allocation. Callables never execute.

Return `{ value, bytes, truncated }`. Schema validates this shape. Paths use JSON Pointer within detached DTO: root `$`, object value `$/entries/0/1`, array value `$/values/0`, and map key/value `$/entries/0/0` / `$/entries/0/1`. Source keys cannot make paths ambiguous or unbounded. Repeated references use identity after adapter unwrapping.

## Implementation steps

1. Maintain one traversal budget and WeakMap for identity per projection.
2. Inspect property descriptors; never invoke getters merely to display values.
3. Handle known built-ins through their native read operations; catch hostile proxy/reflection failures at affected node.
4. Apply limits before allocating huge child arrays or calling unrestricted JSON.stringify. Default depth 10, entries 1,000, string 8 KiB, total 32 KiB.
5. Account encoded UTF-8 bytes including JSON overhead. Reserve enough room for truncation marker and container closure.
6. Stop globally when budget consumed; mark truncated parent rather than continuing sibling scans.
7. Budget can be shared by complete tab/SSR snapshot (512 KiB total), with per-value cap still applied.
8. Detach history values at record time. Read views can project on demand.
9. Do not use JSON stringify/reparse as generic cloning, and do not change application serializer or SSR hydration.
10. Sorting schema/cache rows belongs to reader; projector preserves provided collection ordering.

## Tests first

- Dates, invalid dates, errors, functions, bigints, maps/sets, and nested combinations.
- Cycles and repeated refs produce bounded reference markers.
- Application object resembling special DTO remains ordinary object.
- Throwing getter is not called; throwing descriptor/proxy operation isolated.
- Deep/wide/multibyte values honor encoded byte budget and mark truncation.
- Mutating source after projection leaves retained history untouched.
- Shared snapshot budget stops across sections, not independently per field.
- Result survives JSON round trip without semantic loss of preview tags.

## Validation

`pnpm exec vitest run --project unit packages/devtools/test/projection.spec.ts`, package types, and meaningful failure probe disabling detachment or global budget.

No performance benchmark campaign in this slice. Verify bounded traversal directly with visit counters in controlled test input.

## Exit gate

Every supported input produces detached JSON preview or explicit limitation, without uncontrolled traversal or accessor execution.

## Receipt

- Files changed: `src/projection/{index,project,values,budget,errors}.ts`, `src/protocol/preview.ts`, `test/projection.spec.ts` under `packages/devtools/`.
- Failing tests observed: missing-projector import baseline captured by coordinator. Private `/tmp/rstore-projection-probe-4xz076e3` source snapshot passed five tests; disabling shared budget charging made shared-allowance scenario fail at `expect(second.truncated).toBe(true)`.
- Validation: direct Node 26.2.0 invocation of `node_modules/vitest/vitest.mjs run --project unit packages/devtools/test/projection.spec.ts`: one file, five tests passed. Private snapshot baseline passed, faulty copy failed one expected scenario. No defects injected into shared checkout. Final package-wide types and library/client builds passed.
- Limitations: ordinary object previews inspect enumerable own string-keyed properties; nonenumerable and symbol metadata omitted. Errors read name/message through data descriptors. Function source omitted; bounded display names provided. Native reflection/proxy traps and native bigint conversion cannot be preempted by synchronous JavaScript. Controlled descriptor counters prove projector stops visiting children, not that hostile traps themselves have bounded runtime. Shared-budget callers reserve reply envelope bytes separately and stop/catch `ProjectionBudgetExceededError` when fewer than four bytes remain.

## Final coordinator acceptance

- Slice evidence: Bounded detached projector passed focused fault-sensitive tests and aggregate suites. Final library/declaration/client builds and installed-package import checks passed; no live stores/functions cross wire.
- Final aggregate gates: `pnpm test` passed 267 files / 1,980 tests; one distribution file / four cases conditionally skipped in default run, then all four passed against final v4 tarballs outside monorepo. Final headless browser matrix passed 13 cases in 6.9 seconds. Seven real Nuxt boot files passed, including final SSR lifecycle/privacy and browser/disabled/production scenarios.
- Final tooling gates: all 21 workspace typecheck scripts plus integration/browser types passed through serial `pnpm test:types`; full repository ESLint passed; shared/Core/Vue/devtools builds and Nuxt module build passed serially; docs build passed. Nine current guide snippets passed strict final-v4 installed declarations without aliases or `skipLibCheck`. After last inherited-getter guard repair, affected devtools library/client typechecks, rebuilt artifact, full suite, browser matrix, and installed consumers were rerun successfully; full workspace types and lint had already passed with unchanged public API. See S16 for external ambient-type boundaries.
- Failure-first tests and private fault probes preserved. Source owners confirmed freeze before coordinator consolidation. No staging, commit, or push performed.
