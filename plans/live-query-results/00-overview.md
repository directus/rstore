# Live query results: overview

- Status: closed. S01–S05 shipped on rstore `main`; S06 rejected; S07 implemented in Monospace (`directus-next` working tree, uncommitted).
- Packages: `@rstore/shared`, `@rstore/core`, `@rstore/vue`. S07 lives in `directus-next` (engine and Studio).

## Outcome

Live queries stay correct on the pages they show without a client refetch after each realtime push:

- a realtime connector publishes a server-computed result into the followed page with `payload.setResult`;
- a live query can follow pages other than its main page;
- a push supersedes its page's in-flight fetch; connectors can additionally order results with versions;
- queries and pages expose whether the shown result was confirmed by the server.

Monospace's engine pushes full live-query results over WebSocket. Studio writes pushed rows into the cache, publishes them with one `setResult`, and keeps only the displayed offset page live. Studio uses S02/S03 and S01's disabled-subscription guard, never `payload.refresh`, result versions or confirmation-gated UI. Pushes need no REST refetch, but Studio mutations still trigger their existing REST refresh.

## Slices

| Slice | Status |
| --- | --- |
| [S01: refresh handoff](./01-refresh-handoff.md) | Shipped in `4dd1de55` |
| [S02: pushed page results](./02-pushed-page-results.md) | Shipped in `4dd1de55`, `740913b6` |
| [S03: live pages](./03-live-pages.md) | Shipped in `4dd1de55` |
| [S04: result ordering](./04-result-ordering.md) | Shipped in `4dd1de55`, `b2fa1076`; unused by Monospace |
| [S05: result confirmation](./05-result-confirmation.md) | Shipped in `4dd1de55`; unused by Monospace |
| [S06: pinned cursor pages](./06-pinned-cursor-pages.md) | Rejected 2026-10-25 ([ADR](./adr-pinned-cursor-pages.md)) |
| [S07: Monospace live queries](./07-monospace-migration.md) | Implemented, uncommitted in `directus-next` |
| [S08: resolved subscribe payload](./08-subscribe-payload.md) | Implemented; review fixes verified |
| [S09: pushed item writes](./09-pushed-item-writes.md) | Implemented; review fixes verified 2026-10-26 (types, lint, full suite) |
| [S10: subscription identity](./10-subscription-identity.md) | Implemented; review fixes verified |
| [S11: ended live queries](./11-ended-live-queries.md) | Planned |
| [S12: Monospace adoption of S08–S11](./12-monospace-adoption.md) | Planned |

Docs shipped in `6fc9b58e`: `docs/guide/data/{live,query,cache}.md`, `docs/guide/plugin/hooks.md`, and the `rstore-vue` skill references. Supporting commits landed first: `80b1eb1b` (shared todos test stack), `2247bf17` (query state key matching), `590883d1` (`cache/reset.ts`), `2738c9e7` (deduped result versions, simplified by `b2fa1076`).

Dependency order: S01, then S02, then S03; S04 and S05 depend on S02; S06 would have depended on S03. S07 consumes S02/S03 plus S01's disabled guard.

S08–S11 close API gaps found while building the Monospace connector: subscribe hooks get unresolved options and no key for keyed live queries (S08), connectors must write pushed rows themselves, even for rejected or uncached pushes (S09), fetch-only option changes reopen subscriptions (S10), and a server-ended live query can't be reported (S11). S08, S09 and S11 are independent; S10 builds on S08. S12 applies them in Monospace.

## Design rules

1. Additive API. Defaults keep previous behavior: main page only, no versions, refresh-based connectors keep working.
2. A pushed result follows the same representation rules as a fetched one: refs for cached results, data for `no-cache`, cache slices for paginated `computed` pages.
3. Since S09, connectors pass raw full-result rows and optional `fieldTimestamps` directly to `setResult`. rstore clones accepted inputs, parses and writes them through the fetch pipeline, then publishes the page. No-cache results are wrapped without cache writes; rejected or dropped snapshots write nothing. Delta-only connectors still write deltas directly.
4. Page liveness is chosen per live query outside find options; it never enters `queryId`, fetch options or subscription comparison.
5. Item CRDT stamps and tombstones are unchanged. Versions order page results, not item fields.

## Subscribe payload

```ts
import type { FieldTimestampValue, FindOptions, PublicHookMeta, QueryRefreshOptions } from '@rstore/shared'

interface LiveSubscriptionPayload {
  subscriptionId: string
  key?: string | number
  /** Base options merged with the followed page's options. */
  findOptions?: FindOptions<any, any, any>
  /** Followed page; absent for keyed and unpaged live queries. */
  pageIndex?: number
  /** Live queries only: refetches the followed page. */
  refresh?: (options?: QueryRefreshOptions<FindOptions<any, any, any>>) => Promise<unknown>
  /** Live queries only: publishes a parsed result into the followed page. */
  setResult?: (result: unknown, options?: { meta?: PublicHookMeta, version?: FieldTimestampValue }) => 'applied' | 'stale' | 'inactive'
}
```

Plain `subscribe()` subscriptions get neither `refresh` nor `setResult`. Public types exported from `@rstore/vue`: `LiveQueryOptions`, `SetResultOutcome`, `SetResultOptions`, `SetSubscriptionResult`, `CachedPageRefs`, `PublicHookMeta`.

## Behavior changes for existing rstore users

Studio's `@rstore/{core,shared,vue}` bump from pkg.pr.new `66834cb2` to `de62e099` brings these behavior changes to all Studio queries, where applicable, not just realtime lists. The pin is on `feat/core-data-store`, containing all current `main` plus 19 commits; [S07](./07-monospace-migration.md) also records required relation test-helper updates.

- Disabled live queries (`enabled: false`) don't subscribe; enabling subscribes, disabling unsubscribes.
- The live query subscribes after its query is created, so its first load starts before the subscribe hook runs.
- Function-valued find options (such as `filter`) are no longer part of query, page, confirmation or subscription identity. A function-only change reloads pages in place instead of resetting them.
- `mainPage.options` keeps only a refreshed `pageIndex`; other refresh overrides live in a private per-page `_refreshOptions`, shaping later loads and pushes without changing subscription options.
- Cache state (`$cache.getState()` / `setState()`) carries `pageRefs` with their effective options and confirmation.
- `first` queries keep a fetched or pushed `null` until a committed write could change the answer.

## Changelog notes

Changes since v0.8.4 for the next release:

- Subscribe hooks receive required resolved options, including store defaults and resolution-hook transforms; no-argument `subscribe()` resolves with `many: true`.
- `liveQuery(q => q.first(k))` now passes top-level `key`; Drizzle narrows its topic to the item key.
- Unsubscribe hooks receive the options and key captured when the subscription opened.
- Plain `subscribe()` no longer reopens on client-only option changes (`fetchPolicy`, `dedupe`, `experimentalGarbageCollection`, `fetchOptions`/`autoRefresh`).

- Live-query subscribe payloads expose `end({ reason, retry })`; accepted results renew the bounded recovery budget.
- Drizzle `rejected` messages now end matching live queries: permanent rejections refresh once and set `live` false instead of only warning. Transient `authorize-error` rejections retry with backoff.
