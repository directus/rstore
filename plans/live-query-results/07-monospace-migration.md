# S07: Monospace live queries

- Status: implemented in `/home/akryum/Projects/directus-next`; uncommitted working tree. Engine changed-key and shared-read work and their local verification are recorded below. Studio checks were not rerun for this engine-only update. Paths below are relative to that repository; Studio paths are relative to `packages/studio/` unless stated otherwise.

## Outcome

Studio lists and item views update from engine pushes without a REST refetch caused by the push. Studio uses S02/S03 plus S01's disabled-subscription guard, never `payload.refresh`. No result versions (S04), confirmation-gated UI (S05) or `filteredCount` change. Initial reads and Studio's own mutation refreshes still use REST.

## API

Engine endpoint: `GET /api/{workspace}/realtime` upgrades to a WebSocket. A client joins one `/subscriptions/{id}` topic per live query with the REST read as join payload; the engine answers with REST response envelopes:

```ts
interface LiveQueryJoin {
  collection: string
  /** Restricts the live query to one item. */
  key?: string
  /** REST query string, as the fetch would send it. */
  query: string
}

interface LiveQueryPush {
  type: 'result'
  /** Item list, or one item (`null` once gone or unreadable) for keyed live queries. */
  data: unknown
  meta?: { totalCount?: number }
}
```

Studio `useItems` (`layers/collection-query/composables/use-items.ts`):

```ts
declare const store: any
declare const paginationAvailable: { value: boolean }
declare const currentPageNumber: { value: number }

store.$collection('articles').liveQuery((q: any) => q.many({ pageIndex: 0, pageSize: 25 }), {
  // Only the page shown stays live; an unpaged list is its main page at index 0.
  pages: () => [paginationAvailable.value ? currentPageNumber.value - 1 : 0],
})
```

## Semantics

Engine (`crates/monospace/src/realtime/`):

- Each live query runs as the connection's subject with its permissions, like a REST read; system collections, unknown collections and malformed queries are rejected.
- Every accepted join runs the query and pushes its current result, including the first join, not only reconnects. Normal list mounts and newly loaded page switches therefore cost a REST read plus an engine read; completed pages can be reused without another REST read. The first push can supersede the same page's in-flight REST fetch.
- Finished mutations report changed fields and per-collection stable-key evidence to `LiveQueryNotifier` in the resolver context. Idle queries rerun when dependencies intersect those fields; changed result hashes produce pushes. Clustered replicas broadcast the same evidence on `live_data_events` so each reruns its own queries. The event name remains `live_data.changed.v1`; its shape changed in place and the redundant payload version was removed. No compatibility decoder is retained.
- Pushes are full results with `meta.totalCount` when the read asked for it. Keyed queries push `null` when the item is deleted or no longer readable.
- Changes during a run accumulate fields and stable keys. A follow-up run checks both newly read and previous dependencies. A keyed query skips only when all intersecting changed fields belong to its root collection, that collection's keys are known, and its key is absent. Planner metadata also tracks relation targets: self-relations and paths returning to the root collection retain broad invalidation because they can read other root rows. Both old and new plans participate in this scope check during an overlapping run. Related-collection changes and list queries retain broad invalidation; filtered and permission-hidden keyed queries retain reappearance dependencies.
- Key reporting is collected at connector mutation steps, after data references resolve. Creates use complete supplied keys or unguarded complete `RETURNING` results; keyed updates include old and patched keys; keyed deletes include their target. Filter-based writes, missing key values, failures and referential-action targets remain unknown. `MutationReport` merges the report before the original standalone/ambient finalization boundary ends, including on error/cancellation. Its private boundary enum ties standalone finalization to its tracker and defers ambient transaction finalization without admitting a mismatched guard/tracker pair. Cache data-version invalidation still uses its existing `InvalidationBatch` fields; key evidence does not narrow cache invalidation.
- `CollectionResolver::stable_id()` supplies every stable-ID field. Realtime identities hash global field IDs and typed values, preserving composite-key correlation across replica-local schema layouts; hash collisions cause extra reads. Integer representations normalize signed/unsigned values. Unknown wins over known in mutation, notifier, local/remote and running-read merges. At more than 1,024 distinct keys per collection per batch, the whole key set becomes unknown, freeing retained keys.
- Review fix: first reads run outside the connection read loop, sharing the rerun semaphore (`max(1, realtime.max_concurrent_reruns)`) and shutdown cancellation. Leave requests and token expiry can proceed during a busy first read.
- Review fix: `LiveQueryFormat` converts missing keyed results to `null` while retaining the planner's permission-aware read dependencies, so filtered or permission-hidden items can reappear. Membership identity fences obsolete runs after leave/rejoin of the same topic id, including stale failures and failed-delivery cleanup.
- A failed run removes the registry entry and attempts `kickedOut` with a reason. Token checks run every 60 s, with a separate expiry deadline: close code 4001 is scheduled exactly at expiry, or earlier on failed reverification. Pings use `realtime.ping_interval`; `realtime.max_subscriptions_per_connection` bounds subscriptions, not connections.
- `realtime.enabled: false` rejects upgrades with `RealtimeDisabled` (404). The route also requires an unlocked license. Authentication accepts bearer, query token or session cookie; no token runs as the public role.
- `crates/realtime-core`: typed topic handlers with join payloads and connection context, leave notifications, close frames on shutdown, pings.

Studio:

- `app/rstore/plugins/3.realtime.ts` handles collections served by the items endpoint, excluding composite keys. Review fix: `store.$resolveFindOptions` applies the same search filter as REST; shared `app/rstore/utils/resolve-find-text-search.ts` lets REST and realtime skip impossible searches without an engine subscription.
- Push handling parses and unwraps rows like the fetch hook, trims the pagination sentinel, writes rows with `$cache.writeItem`, then calls `setResult` once with `meta.totalCount` from `resolveTotalCount`. Keyed `null` deletes the cached item and publishes `null`; plain subscriptions only update the cache.
- `app/rstore/utils/resolve-total-count.ts`: shared by the fetch hook (`2.monospace.ts`) and the plugin: engine count when valid, else derived from a short last page.
- `app/rstore/realtime/{client,protocol}.ts`: one multiplexed WebSocket per workspace runtime, opened on first subscription; normal last-unsubscribe closes it after 5 s, allowing page switches to reuse it. Reconnect backoff starts at 1 s and doubles to 30 s. Close code 4001 invokes `recoverUnauthorized` before reconnecting and rejoining.
- Review fix: dropped connections retain interrupted joins for reconnect; subscriptions removed while waiting for open are not joined. An upgrade refused before open triggers one session-recovery probe across consecutive refusals (browsers hide HTTP status); a successful open resets that probe.
- `use-item.ts` keeps the shown item current with a keyed `subscribe` (`fields`, `include`), disabled when the item isn't readable.
- Ordering relies on S02: an unversioned push supersedes its page's in-flight fetch.
- `@rstore/{core,shared,vue}` moved from pkg.pr.new `66834cb2` to `de62e099` (`pnpm-workspace.yaml`, lockfile). The pin is on `feat/core-data-store`, containing all current `main` plus 19 commits. [00's behavior changes](./00-overview.md#behavior-changes-for-existing-rstore-users) apply across Studio queries, not only realtime lists. The bump also requires `NormalizedRelationTarget.indexKey`/`indexFields` in shared test helpers and relation fixtures.
- `patches/nitropack@2.13.4.patch` forwards Nitro dev-proxy WebSocket upgrades with the mount prefix removed. Workspace patch comments track nitrojs/nitro#4480 and removal after an upstream fix.

## Files

- Engine key tracking: `crates/monospace/src/cache/mutation_keys.rs`, `query/executor/connector_step_executor/mutation.rs`, `query/executor/{context,mod,connector_step_executor}.rs`, `query/planner/metadata/{mutated_fields,read_dependencies}.rs`, `realtime/changes.rs`, `realtime/changes/tests.rs`.
- Engine service (under `crates/monospace/src/realtime/`): `{mod,route,topic,subscription,output,registry,worker,notifier,cluster}.rs`, `registry/tests.rs`.
- Engine integration (under `crates/monospace/src/`): `{lib,events,server}.rs`, `api/rest/{mod,error}.rs`, `auth/mod.rs`, `cache/{mutation,tests}.rs`, `context/{resolver_context,transaction,system,init}.rs`, `executor/execute.rs`, `query/planner/metadata/mod.rs`.
- Transport (under `crates/realtime-core/src/`): `{connection,engine,messages,router}.rs`, `engine/tests.rs`, `topics/{topic,topic_connector}.rs`, `topics/topic_connector/in_memory.rs`.
- Config/dependencies: `crates/config/src/{lib,realtime}.rs`, `config.schema.json`, `Cargo.{toml,lock}`, `crates/{monospace,test-integration}/Cargo.toml`.
- Engine harness (under `crates/test-integration/`): `src/apis/{mod,rest,realtime}.rs`, `src/{lib,peer_replica,test_event_manager}.rs`, `src/test_connector/postgres.rs`, `tests/tests.rs`, `tests/realtime/{mod,regressions,running_snapshot,read_gate,events,changed_keys,key_batches,related_keys,running_keys}.rs`.
- Studio runtime: `app/rstore/create-workspace-rstore.ts`, `app/workspace/create-workspace-runtime.ts`, `layers/base/{public.ts,utils/api-fetch.ts}`, `layers/collection-query/composables/{use-items,use-item}.ts`.
- Studio plugins/helpers: `app/rstore/plugins/{2.monospace,3.realtime}.ts`, `app/rstore/realtime/{client,protocol}.ts`, `app/rstore/utils/resolve-{find-text-search,total-count}.ts`.
- Studio tests/helpers: `app/rstore/plugins/__tests__/3.realtime.test.ts`, `app/rstore/realtime/__tests__/client.test.ts`, `layers/collection-query/composables/use-items.test.ts`, `test/utils/{fake-web-socket,rstore-items-store}.ts`, `app/rstore/utils/{__test-helpers__/mocks.ts,get-selection.test.ts,unwrap-nested-data-envelopes.test.ts}`.
- E2E/root: `packages/testing/e2e/tests/realtime/live-lists.spec.ts`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `patches/nitropack@2.13.4.patch`.

## Tests

- Changed-key regressions: `realtime/changed_keys.rs` covers no rerun for other-row create/update/delete, own-row changes, filter bulk writes affecting other rows, old/new key movement, and peer broadcasts. `realtime/related_keys.rs` covers cross-collection reads, same-collection related projections/filters and cascade deletes. Worker consumption/completion test events provide deterministic scheduling assertions without absence sleeps.
- `realtime/running_keys.rs` holds actual PostgreSQL snapshots through shared `ReadGate`: known other-row evidence skips the follow-up SELECT; merging unknown bulk evidence forces exactly one follow-up. `realtime/key_batches.rs` covers known create batches, generated `RETURNING` keys and cap overflow. `realtime/changes/tests.rs` supplements the API suite for composite unique IDs (scalar keyed APIs cannot express them), integer normalization, missing key components, cap merging and unknown dominance.
- Failing-first evidence: before functional changes, `RUST_BACKTRACE=1 cargo test -p monospace-test-integration --test tests -- realtime::changed_keys::` ran the first two regressions. Both failed at scheduling assertions: local “another row's create must not execute Alice's query” and peer “peer must preserve changed keys”, each actual `1`, expected `0`.
- Additional failing-first evidence: `realtime::related_keys::keyed_self_relation_still_reruns` failed with actual `0`, expected `2` scheduled reads before related-root scope metadata was added. Cross-collection and cascade cases already passed at that point.
- Changed-key verification (2026-10-26): `RUST_BACKTRACE=1 cargo test -p monospace-test-integration --test tests -- realtime::` passed all 24 tests, none ignored, using the configured PostgreSQL connectors and RabbitMQ peer topology. `cargo fmt -p monospace -p monospace-test-integration -- --check` passed. The affected unit command `RUST_BACKTRACE=1 cargo test -p monospace --lib -- realtime:: cache:: query::planner::metadata query::executor::connector_step_executor test_events::` passed 50 tests. The combined `realtime:: cache::` integration filter passed 37 tests, including real Redis invalidation. After final ownership cleanup, the combined 37 integration tests and 50 affected unit tests passed again. `cargo clippy -p monospace -p monospace-test-integration --all-targets -- -D warnings` and the final formatting check passed. No tests were ignored. No TOML changed, so Taplo was not applicable. Verification used the configured PostgreSQL, RabbitMQ and Redis services; other connector configurations were not exercised.

- `crates/test-integration/tests/realtime/mod.rs`: `list_follows_rest_mutations`, `mutations_that_change_nothing_read_do_not_push`, `item_subscription_pushes_null_once_deleted`, `results_follow_the_subscriber_permissions`, `unsubscribed_queries_stop_pushing`, `rejects_unknown_collections`, `peer_replica_mutations_push_to_local_subscribers`.
- `realtime/running_snapshot.rs`: `mutation_during_initial_read_publishes_fresh_rerun`. `realtime/regressions.rs`: `unrelated_writes_during_initial_read_do_not_rerun`, `busy_initial_read_does_not_block_leave`, `token_expiry_closes_busy_initial_read`, `keyed_filtered_item_reappears`, `keyed_permission_hidden_item_reappears`, `rejoined_topic_ignores_inflight_old_query`. Busy-read cases use PostgreSQL and shared `read_gate.rs`; keyed reappearance cases run across connectors.
- `crates/monospace/src/realtime/registry/tests.rs`: `unrelated_changes_during_run_do_not_schedule_rerun`, `newly_discovered_dependencies_preserve_changes_during_first_read`, `coalesced_changes_are_consumed_by_one_rerun`, `previous_dependencies_preserve_changes_across_dependency_transition`, `obsolete_success_does_not_touch_rejoined_subscription`, `obsolete_failure_does_not_remove_rejoined_subscription`.
- `crates/realtime-core/src/engine/tests.rs`: payload/context delivery, leave cleanup, server close frames and failed-join kick-out, alongside existing transport cases.
- `app/rstore/plugins/__tests__/3.realtime.test.ts`: REST query parity, cached/no-cache pushed values, counts, ownership and keyed deletion. `layers/collection-query/composables/use-items.test.ts` (`useItems - live pages`): displayed pages, relational-filter pushes, matching REST/search filters and impossible searches remaining empty without a new join.
- `app/rstore/realtime/__tests__/client.test.ts`: reconnect/rejoin, interrupted initial joins, removed subscriptions during reconnect, one recovery probe across refused upgrades, failed recovery, unauthorized close and kick-out. Shared fake socket: `test/utils/fake-web-socket.ts`.
- E2E `packages/testing/e2e/tests/realtime/live-lists.spec.ts`: observer browser page plus REST mutations via the first browser context's request API; edits/inserts/deletes on pages 1 and 2 and relational-filter membership update observer without additional observer REST reads. This does not test mutations through a second Studio UI.

## Notes

Known limitations:

- Key skipping currently applies to exact integer, UUID and boolean stable-ID values. String/collation, bytes/padding, decimal, float, temporal, null and other uncertain value domains fall back to unknown and rerun. Public scalar keyed APIs still require a single primary key; internal key identity supports composite stable IDs without inventing a new wire key format.
- Raw/uninstrumented paths, filter-based bulk writes, incomplete/guarded `RETURNING`, indirect referential actions, and key-cap overflow keep conservative reruns. Database triggers or external writers are not newly observed by this change; their effects still require engine-reported field changes.

- Only the displayed offset page is live; no pinned windows (S06 rejected).
- A push not accepted within 10 s silently removes that live query's registry entry. No `kickedOut` is sent and the connection stays open; the client cannot detect that live updates ended.
- Failed session recovery schedules no transport reconnect or rejoin.
- Token-expiry reconnect forces refresh-token rotation through session recovery and a full rejoin, even if HTTP already refreshed the cookie; existing sockets retain their original token.
- Pushed rows carry no `fieldTimestamps` or result version. An older REST response from another query can overwrite newer pushed values.
- Studio's own mutations still trigger `usePaginatedQuery`'s `afterMutation`/`afterManyMutation` REST refresh on top of the push; observer E2E coverage bypasses those hooks.
- No WebSocket `Origin` check while cookie authentication is accepted; no per-user/IP connection limit. Subscription count and shared read concurrency are the implemented bounds.
- System-collection and schema changes do not trigger reruns: the notifier forwards workspace primitive-field changes only. Permission, policy and role changes therefore apply only at the next relevant data change (a revoke leaves the last pushed result on the client; a grant shows new rows late). Time-based rules (`$NOW`) do not rerun as time passes. A revoked API key or suspended user keeps receiving pushes until the next 60 s token re-check. A failed cluster broadcast is logged, not retried; a later relevant change or rejoin is needed to catch up.
- A non-reading client can wedge its connection: socket writer, acknowledgements, pings and close sends have no timeout. The live-query push timeout only bounds that caller's wait; it does not cancel the socket send.

## Engine shared reads (2026-10-26)

### Design and implementation

- Chosen design (b): registry-owned mutation epochs with a map keyed by workspace ID, persisted schema generation and the permission-planned query fingerprint. Each caller still parses, resolves its own permissions and builds its own plan. Equal fingerprints await one cancellable `OnceCell` initialization and replay its complete buffered executor result. `totalCount` and the separate count SQL (when needed) are inside that initialization. Each subscription keeps its own result hash, dependencies and membership identity, and serializes its own response envelope.
- Design (a), changing live reads to `CacheReadPolicy::Use`, is insufficient. `MutationTracker::finish` notifies realtime before spawning asynchronous `InvalidationBatch` data-version increments; invalidation failures retry later. A rerun could therefore hit a result from before its triggering mutation. Version snapshots keep cache stores distinguishable once increments become visible, but do not establish an await-before-notify barrier. Even after adding such a barrier, concurrent cache misses do not coalesce, disabled/error/oversized cache entries do not guarantee sharing, and non-workspace-specific collections make otherwise valid read plans uncacheable. Cache hits do preserve `meta.read_dependencies` and related-collection metadata because both are taken from each caller's freshly planned metadata; that part of (a) is sound. These facts favor explicit sharing without coupling realtime correctness to Redis availability or TTLs.
- Live reads retain `Bypass(RustCaller)`. Read fingerprints reuse the cache's canonical plan/filter/layout serializer, extended to all read plans independently of cacheability. Resolved `$CURRENT_USER` values, conditional field permissions, key predicates, pagination, selection, ordering and count requests are fingerprinted. Sharing happens only after each subject's permission planning; raw query strings or role IDs are never authorization identities.
- The registry swaps each changed workspace's epoch before recording every consumed local/remote change batch. Other workspaces keep their own epochs. An in-flight result stays in its old allocation; a pending follow-up reacquires the latest epoch, preserving the held-snapshot guarantee. New joins also start fresh epochs so they cannot replay an arbitrarily old snapshot. Queued callers plan against their retained workspace resolver; workspace identity, generation and layout prevent cross-workspace/schema reuse. Missing persisted scope conservatively executes without sharing.
- Completed results live until the next change batch or join, or until the last subscription in that workspace leaves. New joins rotate instead of adding historical queries to a retained map; epoch entries come from current subscriptions and already in-flight executions, without accumulating queries across successive joins. Failed/cancelled initializers leave cells empty for another caller to retry. The existing scheduler semaphore and shutdown cancellation still own query work; no detached producer task is introduced. The shared execution future is boxed so buffering/OnceCell state does not inflate every generic executor future and nested permission read. Leave/rejoin and per-subscriber hash fences remain in the registry.

### Tests and verification

- Implementation files: `crates/monospace/src/realtime/read_group.rs`, `{registry,worker,subscription,mod}.rs` beside it, `executor/execute.rs`, `query/planner/metadata/mod.rs` and `test_events/mod.rs`.
- `realtime/sharing.rs` covers different users with equal permissions, sequential replay with one scheduler permit, one data read per change, independent unchanged-hash suppression, one shared data/count execution, count-only updates, and exact `$CURRENT_USER.email` isolation through removal/reappearance. PostgreSQL `ReadGate` counts real scans on a one-row fixture; `limit=1` forces the separate COUNT query. `realtime/sharing_snapshot.rs` holds a real snapshot and waits for both permission-planned callers before an overlapping mutation; both must receive the held result followed by the fresh result with two total reads, not four.
- Failing-first command: `RUST_BACKTRACE=1 cargo test -p monospace-test-integration --test tests -- realtime::sharing::`. Before production changes, equal-permission subscribers failed with actual **2**, expected **1** SELECT per change; count subscribers failed with actual **4**, expected **2** data/count SELECTs. The permission-isolation scenario already passed. Initial fixture-only attempts were corrected (field grants also need an item rule; an unbounded short page derives its count without COUNT SQL) and are not counted as regression evidence.
- Initial full validation exposed stack overflow from embedding shared buffering/OnceCell execution in every generic executor future. Moving that work into `ReadGroup` behind a boxed boundary fixed it. The focused five-test run then passed on normal test-thread stacks, including all new scenarios and the previously overflowing regression.
- Final integration verification: `RUST_BACKTRACE=1 cargo test -p monospace-test-integration --test tests -- realtime:: cache::` passed **41 tests**, none ignored, including all **28 realtime tests**, existing `running_snapshot`, `rejoined_topic_ignores_inflight_old_query`, permission tests, real Redis invalidation and RabbitMQ peers. `cargo fmt -p monospace -p monospace-test-integration -- --check` passed. `RUST_BACKTRACE=1 cargo test -p monospace --lib -- realtime:: cache:: query::planner::metadata query::executor::connector_step_executor test_events::` passed **50 unit tests**, none ignored. `cargo clippy -p monospace -p monospace-test-integration --all-targets -- -D warnings` passed. All builds/checks ran outside the sandbox through plain `cargo` (mise/mbx), with builds serialized. No task-owned TOML changes, so Taplo was not needed. No tests were skipped; other connector configurations were not exercised.

### Limitations

- Sharing is replica-local. Concurrent joins/change batches can start separate epochs and conservatively perform extra reads. Different resolved permission filters (including time-dependent values) retain separate executions. Every subscriber still pays parsing, permission lookup/planning, buffering replay and serialization costs; the optimization shares the data/count execution, not permission lookup queries.
- Buffered results stay in memory for the current epoch and replay clones rows for each subscriber. This uses no persistent query cache and has no new TTL/configuration/compatibility path. Existing external-writer, system-data notification, permission-change notification and time-based rerun limitations above remain.

## Engine realtime metrics (2026-10-26)

### Implementation

- Reuses `monospace-tracing-setup`, global `monospace` meter, existing OTLP provider,
  resource attributes and shutdown flush. `enable_otel_export` gates registration
  and recording; no new configuration, dependency, transport or metrics stack.
- `tracing-setup/src/realtime.rs` owns typed recording helpers and cancellation-safe
  drop guards; `realtime/instruments.rs` owns registration. Engine registry startup
  fixes the recording policy before accepting work. Guards count WebSocket receiver
  lifetimes, registry memberships and tickets awaiting scheduler permits; removal,
  destruction and cancellation release counts. Immediate follow-ups keep their
  permit and are not counted as queued again.
- Metrics (prefix `monospace.realtime.`): `connections`, `subscriptions`,
  `rerun.queue_depth` (signed up-down counters); `rerun.duration` (histogram, `s`);
  `rerun.skipped`, `read.shared`, `pushes`, `push.timeouts`, `slow_client.drops`,
  `runs.failed`, `cluster.broadcasts.sent`, `cluster.broadcasts.received`,
  `cluster.broadcasts.failed` (counters); `push.payload.size` (histogram, `By`,
  whose sum gives total result bytes).
- Only `rerun.duration` has a point attribute: `monospace.realtime.outcome` is
  `pushed`, `unchanged`, `failed` or `removed`. No workspace names, user IDs, query
  strings, topic IDs or replica IDs become metric attributes. Static attributes
  and borrowed instrument handles add no application-side allocation per record.
- Duration includes initial reads, shared-result replay and follow-ups, starts
  after acquiring a permit and includes successful/failed result delivery. Query
  failure is recorded before best-effort kick-out delivery. Stale memberships,
  cancellation and failed delivery use `removed`; cancelled queue waits are not
  runs. Successful pushes measure UTF-8 result bytes without transport envelope.
- Changed-key savings count field-matched idle skips and avoided coalesced
  follow-ups. Shared reads count successful replays, not map hits, failed attempts
  or replacement initializers. One data/count execution group counts once.
- Cluster success counts dispatched batches; receipt counts decoded events,
  including self echoes. Failure counts dispatch, decoding, declaration and
  listener failures. Existing retry/replay behavior stays as documented above.
- Slow-client drops count only actual current-membership removal after a result timeout;
  an overlapping leave/rejoin or a failed-run notification timeout cannot inflate drops.
- Full semantics: `directus-next/docs/observability.md`, linked from existing
  `crates/tracing-setup/readme.md` observability instructions.

### Tests and failing-first evidence

- Uses existing `opentelemetry_sdk` in-memory exporter in tracing-setup, with isolated
  providers rather than replacing globals. Two tests cover overlapping lifetimes,
  unpolled queued-future cancellation, balanced counts, four run outcomes, failure
  counts, successful push totals/bytes, all event counters, units and exact bounded
  attributes. Existing Engine realtime integration tests exercise Engine behavior;
  metric values are asserted separately through the isolated exporter.
- Failing first: `cargo test -p monospace-tracing-setup --lib -- realtime::` ran before
  recording helper bodies were implemented; both tests failed because exporter had
  no connection/run measurements (`no entry found for key`, missing duration).
  Same two tests passed after recording was implemented.

### Known limitations

- Exporter tests prove recording/helper contracts; they do not independently force
  every Engine timeout or broker failure and assert its metric. Existing integration
  scenarios remain the behavior regression boundary. No external collector/dashboard
  verification or additional connector matrix is claimed.
- Metrics observe socket writes, not client acknowledgements. Queue depth includes
  obsolete tickets until permit acquisition/cancellation. Connection counts follow
  receiver task lifetime, including stalled close/cleanup. Push timeout still removes
  a query without closing its connection or cancelling the underlying socket send.
  Cluster failure totals include retry attempts, not exact lost change batches.

### Verification results

- `RUST_BACKTRACE=1 cargo test -p monospace-test-integration --test tests -- realtime::`
  passed all **28 realtime tests**, none ignored, with configured PostgreSQL and
  RabbitMQ peer services. `RUST_BACKTRACE=1 cargo test -p monospace --lib -- realtime::`
  passed **8 affected Engine unit tests**, none ignored.
- `RUST_BACKTRACE=1 cargo test -p monospace-tracing-setup --lib` passed all **18 tests**,
  including both new exporter tests, none ignored.
- `cargo clippy -p monospace -p monospace-tracing-setup --all-targets -- -D warnings`
  passed. `cargo fmt -p monospace -p monospace-tracing-setup -- --check` passed.
  No task-owned TOML changed; Taplo was not applicable. All Rust commands used plain
  `cargo` through mise/mbx outside the sandbox, with task builds serialized.
- Final repeat of the full **28-test** realtime integration command passed after
  slow-client membership accounting and receiver-lifetime review. No tests were
  skipped. Other connector configurations and an external OTLP collector were not
  exercised; per-path Engine timeout/broker metric assertions remain outside this
  exporter-helper coverage.
