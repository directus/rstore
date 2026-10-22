# S11: inspector cache and CRUD actions

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Depends on: S06, S09, S10.
- Owner: action controls and outcome state.
- Contract: [overview](./00-overview.md).

## Outcome

Inspector executes shared cache and collection actions against selected target, showing accepted/completed/failed/unknown outcomes accurately.

## Files

- Create `packages/devtools/app/stores/actions.ts`.
- Create `app/components/actions/JsonEditor.vue`, `ItemActionDialog.vue`, `ActionResult.vue`.
- Update Cache toolbar/rows, Collections item controls, and History clear control.
- Reuse protocol schemas and preview renderer.
- Create `packages/devtools/test/inspector-actions.spec.ts`.
- Add `test/browser/devtoolsActions.spec.ts`; reuse existing devtools fixture/driver.

## Controls

Cache: write item, delete addressed item, clear cache. Collections: create, update, delete only where producer reports capability. History: clear current target history.

Item editor accepts JSON object; validate before enabling submission and show concise exact field error. Do not parse JavaScript, execute snippets, infer key from displayed preview, or round-trip projected value as mutation payload.

Action dialog captures full target and collection/key when opened. Selection change closes/invalidates it; submit rechecks captured target equals current live target. User cannot accidentally apply old editor content to newly selected store.

Read-only, SSR, disconnected, incompatible, or unavailable capability disables action with concise reason. This complements producer enforcement; client flags never grant permission.

Cache/connector clear and delete use explicit confirmation containing actual target/collection/key. Confirmation is product action control, not extra coding-agent permission request. Avoid colored border decoration; selection and state use subtle backgrounds.

## Outcome lifecycle

Assign fresh command ID and issued time per deliberate submission. Pending control prevents duplicate clicks; shared executor dedups transport duplicates.

Track action by target and command ID. Completed action refreshes affected tab revisions. Queued/accepted action shows that state; do not claim backend completion. Backend failure keeps entered JSON and bounded error.

Timeout/disconnect after possible dispatch shows unknown outcome with command ID. Do not automatically retry. Allow user to inspect refreshed data/history, or explicitly check/replay same command within valid window using same envelope only when transport supports dedup lookup. A new deliberate action uses new ID and states risk if previous outcome remains unknown.

Late action completion may update its stored outcome record but cannot change currently selected target's views or display stale toast in new target. Use S09 request/selection epoch fence.

## Tests first

- Browser creates/updates/deletes via real connector; cache changes and history verify public pipeline.
- Cache write/delete/clear change actual cache; no direct DTO editing.
- Malformed JSON and schema-invalid input never dispatch.
- Double-click produces one logical action/connector call.
- Opening dialog then switching target prevents submission against either target.
- SSR/read-only/disconnected targets reject controls and direct crafted requests.
- Connector rejection retains editor input and shows useful error.
- Offline queue result reports accepted/queued.
- Delayed completion from old target cannot refresh/toast new target.
- Unknown outcome causes no automatic retry.

Use real browser for action authority and user flow; unit tests cover state transition/deadline fencing with controlled promises. Avoid duplicate tests proving only button CSS/disabled classes.

Run `pnpm exec vitest run --project unit packages/devtools/test/inspector-actions.spec.ts` and `pnpm test:browser devtoolsActions --project headless`.

## Exit gate

Supported UI actions affect actual selected store once and report truthful outcome. Read-only/SSR/stale-target guards work at UI and runtime layers.

## Implementation receipt

- Status: verified; final coordinator acceptance passed on 2026-10-08.
- Changed files: target-bound action draft/outcome state, JSON editor, native modal dialog, action result renderer; cache CRUD/clear, collection CRUD and history clear controls.
- Tests demonstrated failing before implementation: new command tests added alongside implementation; no isolated behavioral fault probe run.
- Commands and results: focused inspector suites, 13 tests pass; client Vue typecheck and scoped repository ESLint pass. Tests protect typed zero/empty-string keys, unsafe JSON rejection, destructive confirmation, target invalidation, pending duplicate prevention, stale completions and known failure versus unknown dispatch outcome.
- Browser action evidence: dedicated headless matrix passed twelve initial scenarios; final rebuilt matrix passed thirteen. UI created/updated/deleted through real Core connector while preserving other Vue backend rows; wrote/deleted numeric-zero cache address; confirmed cache/history clear and preserved other store data; disabled writes on actual read-only registration. Two built viewers converged on selected-store mutation; durable offline scenario showed accepted outcome without claiming remote commit. Unit controlled dispatch tests remain ownership/outcome proof, separate from connector effects.
- Limitations / follow-up: latest retained SSR UI controls scenario passed against final rebuilt library/client; direct SSR enforcement belongs to shared runtime/SSR suites. No isolated action fault campaign performed. Unknown outcome never auto-retries; command records and captured command ID remain inspectable across selection changes.

## Final coordinator acceptance

- Slice evidence: Final actual browser matrix verified real connector create/update/delete, cache actions, history clear, read-only controls/direct denial, confirmation and safe typed key handling. Source ownership tests prevent stale/unknown completion from redirecting or replaying writes.
- Final aggregate gates: `pnpm test` passed 267 files / 1,980 tests; one distribution file / four cases conditionally skipped in default run, then all four passed against final v4 tarballs outside monorepo. Final headless browser matrix passed 13 cases in 6.9 seconds. Seven real Nuxt boot files passed, including final SSR lifecycle/privacy and browser/disabled/production scenarios.
- Final tooling gates: all 21 workspace typecheck scripts plus integration/browser types passed through serial `pnpm test:types`; full repository ESLint passed; shared/Core/Vue/devtools builds and Nuxt module build passed serially; docs build passed. Nine current guide snippets passed strict final-v4 installed declarations without aliases or `skipLibCheck`. After last inherited-getter guard repair, affected devtools library/client typechecks, rebuilt artifact, full suite, browser matrix, and installed consumers were rerun successfully; full workspace types and lint had already passed with unchanged public API. See S16 for external ambient-type boundaries.
- Failure-first tests and private fault probes preserved. Source owners confirmed freeze before coordinator consolidation. No staging, commit, or push performed.
