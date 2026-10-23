# S07: Monospace consumer migration

- Status: planned.
- Depends on: S01, S02, S03; uses S04 and S05 when released.
- Owner: `directus-next` Studio realtime connector and `useItems`. This happens in that repository, after the rstore release it needs is pinned there (`pnpm-workspace.yaml` `@rstore/*` pkg.pr.new URLs).
- Contract: [overview](./00-overview.md).

## Outcome

Studio applies engine pushes directly. There is no REST refetch after a push and no hand-rolled page subscription.

## Current workarounds to remove

- **`liveRefresh` find option** (`layers/collection-query/types/rstore.ts`), its forwarding in `useItems`, and the `getRefresh(payload) ?? findOptions?.liveRefresh` fallback in `app/rstore/plugins/3.realtime.ts`.
- **`useLivePage`** (`layers/collection-query/composables/use-live-page.ts`).
- **Refetch on change** in the plugin's `applyResult`:
  - `rowsChanged` refresh;
  - the `uncached` refresh on every push;
  - the first-push skip (`previousKeys`).
- **The plugin-side `enabled: false` guard**, redundant after S01.

## Target

1. **Plugin push handling.**
   - Write pushed items into the cache as today.
   - Then `payload.setResult(items, { meta: result.meta, version: result.version })` when present.
   - Keep `refresh` only as the fallback for payloads without `setResult` (plain subscriptions), and on `onEnded` and reconnect.
2. **`useItems` page following.**
   - `liveQuery(…, { pages: () => [currentPageNumber.value - 1] })` when pagination is available; omitted otherwise.
   - `usePaginatedQuery` keeps fetching non-main pages through `fetchMore`. The page subscription follows whichever page is shown.
3. **Engine pushes.**
   - `meta` is already pushed: `crates/monospace/src/realtime/subscription.rs` wraps results in `DataEnvelope::with_meta`. Studio's `protocol.ts` only declares `totalCount`; extend it to `filteredCount` and forward it through `setResult`.
   - Add a monotonic result version (transaction id), so S04 can order pushes against REST responses. The REST read returns the same version in its response meta, which the monospace fetch hook copies into `meta.$resultVersion`.
4. **Empty states.** After S05, `useItems.showLoading` and empty states use `query.confirmed` instead of the count heuristics around `isSettled`/`totalItemsCount`.

## Tests

- Rewrite the `useItems - live pages` suite (`use-items.test.ts`):
  - page 1 and page 2 pushes update without any new `items.requests`;
  - relationally filtered (`no-cache`) pushes show new values without requests.
- Plugin tests (`3.realtime.test.ts`):
  - `setResult` is called with parsed items and meta;
  - a stale version is ignored once S04 lands.
- Delete tests that only covered removed workarounds.

## Exit gate

- Studio lint, typecheck and unit tests pass.
- Manual two-client check: editing, inserting and deleting rows on page 1 and page 2, and with a relational filter, updates the other client without REST requests in its network log.
