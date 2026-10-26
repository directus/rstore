# S04: result ordering

- Status: shipped in `4dd1de55` (docs `6fc9b58e`); deduped consumers simplified in `b2fa1076`. Optional; Monospace doesn't use it.

## Outcome

Fetched and pushed page results can carry a version. A page never replaces a result with an older one, whatever order responses arrive in. `requestId` supersession orders requests by start time; versions order results by the server state they reflect.

## API

```ts
import { definePlugin } from '@rstore/vue'

export default definePlugin({
  name: 'versioned-remote',
  category: 'remote',
  setup({ hook }) {
    hook('fetchMany', async ({ meta, setResult }) => {
      const response = await fetchRows()
      meta.$resultVersion = response.version
      setResult(response.rows)
    })
    hook('subscribe', ({ setResult }) => {
      onPush((rows, version) => setResult?.(rows, { version }))
    })
  },
})

declare function fetchRows(): Promise<{ rows: any[], version: number }>
declare function onPush(cb: (rows: any[], version: number) => void): void
```

Versions are `FieldTimestampValue`: a finite number or a serialized HLC string, compared with Core's `compareHLC`. Transaction ids or LSNs must be encoded into one of these.

## Semantics

- **Validation** (`query/version.ts`). `setResult` throws a `TypeError` for any other format, before changing the page. An invalid fetch `$resultVersion` warns once and counts as unversioned.
- **Comparison.** Each page keeps a private `_resultVersion`. A lower version is dropped: a stale push returns `'stale'`; a stale fetch collects its unowned tracking, keeps its metadata out and still settles its lane. Equal versions apply.
- **Unversioned results** apply without comparison and clear the page's version.
- **Versioned push vs fetch in flight.** A versioned push keeps the page's current `requestId`, so a fetch already in flight can still publish a newer version. An unversioned fetch that was in flight when a versioned push was accepted is dropped, cache writes included; fetches started later apply.
- **Queued pushes.** A versioned non-main push reserves its version before the main-page wait, so a lower-version fetch cannot overwrite its rows meanwhile.
- **Lifecycle.** `refresh()` keeps versions. A base-options reset clears the reused main page's version; other pages are dropped.
- **Metadata.** rstore reads `$resultVersion` from fetch metadata and removes it from published query metadata.
- **Deduped fetches** (`packages/core/src/query/dedupe.ts`). Core passes the shared request metadata to each consumer's `$canPublishQuery(responseMeta)`, so its guard sees the response version while cache writes run, and copies `$resultVersion` to every consumer's metadata when the request settles (background completion included).

## Files

- `packages/shared/src/types/hooks/{meta,realtime}.ts`: `$resultVersion`, `$canPublishQuery(responseMeta)`, `SetResultOptions.version`.
- `packages/core/src/query/dedupe.ts`.
- `packages/vue/src/query/{version,result,push,page,load}.ts`: validation, `isStalePageResult`, `markVersionedPush`, `reservePageResult`.

## Tests

- `packages/vue/test/integration/query/pushed-results-ordering.spec.ts`: both race directions, equal versions, per-page versions, option resets, deduped consumers (including one joining an older request after a push), unversioned in-flight drop.
- `packages/vue/test/integration/query/result-version-format.spec.ts`.
- `packages/vue/test/query-public-api.test-d.ts`.

## Notes

- Versions order page results, not item fields: connectors still supply `fieldTimestamps`, and a stale push cannot undo cache writes made before `setResult`.
- Mixing versioned and unversioned results on one page gives no continuous ordering guarantee.
