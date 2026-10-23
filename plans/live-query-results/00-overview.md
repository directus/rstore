# Live query results: overview and implementation contract

- Status: S01–S05 implemented and verified in the working tree, followed by two review-fix passes and a cleanup pass; landed on `main` in `4dd1de55` (feature) and `6fc9b58e` (docs), after `80b1eb1b`, `2247bf17`, `590883d1` and `2738c9e7`. S06 delivered as a design (ADR Proposed, contract not agreed). S07 planned.
- Written: 2026-10-23.
- Planning checkout: `main` at `6dd52b3c`. All S01–S05 work, review fixes and cleanup landed on top of it in commits `80b1eb1b`..`6fc9b58e`.
- Packages: `@rstore/shared`, `@rstore/core`, `@rstore/vue`. S07 changes the Monospace Studio consumer (`directus-next`), not this repository.
- Delivery: 7 slices. Staging, commit and push are not authorized.

## Outcome

Live queries stay correct on every page they show, without a client refetch after each realtime push:

- a connector that receives a server-computed result for a live query can hand it to the query;
- live queries can follow loaded pages beyond the main one;
- an older result never replaces a newer one;
- consumers can tell server-confirmed results from cache guesses.

## Motivation

Monospace's realtime engine re-runs a subscriber's REST list read when the mutated fields intersect its read dependencies, and pushes the full new result. Its Studio connector (`packages/studio/app/rstore/plugins/3.realtime.ts` in `directus-next`) must currently:

- write pushed rows into the cache, then call `refresh` when the rows of the result changed. Membership is lost otherwise for `resultMode: 'responseRefs'` queries, and any change is lost for `no-cache` queries. So every relevant change costs a push plus a REST round trip, and the REST response can land after, and overwrite, a newer push;
- carry its own `liveRefresh` callback in find options, because the pinned build doesn't pass `refresh` to the subscribe hook (S01);
- open a second, plain subscription for the page shown past the first (`useLivePage`), because `liveQuery` only follows its options' window, the main page.

Research into other libraries (Hasura, PostGraphile, Convex, InstantDB, Zero, TanStack DB/Query, Firestore, Meteor, RxDB) found:

1. Systems that push the full result apply it directly; none of them refetch after the push.
2. Nobody keeps independent offset pages live. They rerun everything, pin each page to a key range (Convex, Instant), or use one growing window.
3. Results carry a version or snapshot so stale ones are dropped.
4. Partial or unconfirmed results are labeled (Zero `unknown`/`complete`).

The full write-up lives in the Monospace session notes (`live-list-queries-research.md`).

## Locked decisions

1. Additive API. Defaults keep current behavior: main page only, no versioning, refresh-based connectors keep working.
2. A pushed result follows the same representation rules as a fetched one: refs for cached results, data for `no-cache`, computed slices for `computed` pages.
3. Connectors still write pushed items into the cache themselves (`$cache.writeItem` with `fieldTimestamps`, as today). `setResult` only publishes a page result and meta; it never writes items.
4. Page-level liveness is opt-in, chosen per live query, and lives outside find options. It must not affect `queryId`, fetch options or the subscription's `findOptions` comparison.
5. Item-level CRDT stamps (`fieldTimestamps`, tombstones) stay as they are. S04 orders page results, not item fields.
6. Pinned cursor pages (S06) are a design slice. Do not implement them before their contract is agreed and recorded.

## Documents and order

- [S01: refresh handoff](./01-refresh-handoff.md)
- [S02: pushed page results](./02-pushed-page-results.md)
- [S03: live pages](./03-live-pages.md)
- [S04: result ordering](./04-result-ordering.md)
- [S05: result confirmation](./05-result-confirmation.md)
- [S06: pinned cursor pages (design)](./06-pinned-cursor-pages.md)
- [S07: Monospace consumer migration](./07-monospace-migration.md)

Dependencies:

- S01 first.
- S02 and S03 both depend on S01. They touch the same payload builder, so implement S02 before S03.
- S04 depends on S02.
- S05 depends on S02 and can run alongside S04 if file ownership is split: S05 owns `state.ts`/`types.ts` page fields, S04 owns `page.ts` ordering.
- S06 depends on S03.
- S07 depends on S01–S03; it gains from S04 and S05 when available.

## Shared payload contract (target after S03)

The subscribe hook payload for a live query subscription:

```ts
interface LiveSubscriptionPayload {
  store: GlobalStoreType
  meta: CustomHookMeta
  collection: ResolvedCollection
  subscriptionId: string
  key?: string | number
  /** Options of the followed page: base options merged with the page's own (`pageIndex`, params). */
  findOptions?: FindOptions
  /** S03: index of the page this subscription follows; `undefined` for keyed or unpaged live queries. */
  pageIndex?: number
  /** S01, scoped to the followed page by S03. */
  refresh?: (options?: QueryRefreshOptions<FindOptions>) => Promise<unknown>
  /** S02: publishes a server-computed result for the followed page. */
  setResult?: (result: unknown, options?: SetResultOptions) => SetResultOutcome
}

interface SetResultOptions {
  /** Public metadata only: `$`-prefixed fields are excluded from the type. */
  meta?: PublicHookMeta
  /** S04 snapshot version. */
  version?: FieldTimestampValue
}

/** `'applied'` means accepted: a queued non-main push can still be dropped before it publishes. */
type SetResultOutcome = 'applied' | 'stale' | 'inactive'
```

Plain `subscribe()` subscriptions get neither `refresh` nor `setResult`.

## Global test rules

- Write the failing integration test first, using `createVueStack`, `FakeRemote`, `remote.seed` and the `subscribe` hook payload, as in `packages/vue/test/integration/subscriptions.spec.ts`. Record the failure in the slice receipt.
- Assert observable query state: `data`, `pages`, `meta`, loading/error lanes and remote call counts. Don't assert private fields unless no public effect exists.
- Superseding is part of every result-publishing slice: cover a response in flight when a push lands, and a push landing after the scope is disposed.
- Run `pnpm exec vitest run --project unit <files>` per slice, then `pnpm test`, `pnpm test:types` and lint before acceptance.

## Documentation

- Each public addition updates `docs/guide/plugin/hooks.md` (Subscriptions) and `docs/guide/data/live.md`.
- S03 also updates the pagination docs.
- Skill and readme copies follow the repository's existing generation (`SKILLS-GENERATION.md`).

## Cleanup pass

- Behavior unchanged. Public types `LiveQueryOptions`, `SetResultOutcome`, `SetResultOptions`, `SetSubscriptionResult`, `CachedPageRefs` and `PublicHookMeta` are exported from the `@rstore/vue` root. `SetResultOptions.meta` excludes `$` fields; the internal fetch confirmation flag moved from `CustomHookMeta` to a private `WeakMap` in `query/confirmation.ts`.
- `cache/writes.ts` split: state replacement (`setStateNow`, `clearNow`) moved to `cache/reset.ts`.
- Test helpers merged into `packages/vue/test/utils/live-query.ts`; overlapping teardown and provenance specs merged; private `_result` / `_setPageResult` assertions replaced by public observations.
- Guides gained behavior-change notes for existing users and precise `setResult` outcomes; the S06 links in user docs became "not supported yet".
