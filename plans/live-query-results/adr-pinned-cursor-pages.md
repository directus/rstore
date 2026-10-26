# ADR: pinned cursor pages for live query results

- Status: rejected, 2026-10-25 (proposed 2026-10-23).
- Scope: [S06](./06-pinned-cursor-pages.md). No runtime API exists for it.

## Decision

Don't implement pinned cursor pages. Live queries keep offset pages; consumers follow the pages they display with `liveQuery(..., { pages })` and receive pushes through `setResult`. Monospace Studio follows only the displayed page.

Docs' "not supported yet" (`docs/guide/data/{live,query}.md`) describes current runtime support, not a commitment to this rejected proposal.

## Why

- Numbered-page tables show one page at a time; offset pages are correct for them.
- The design touches every layer: page identity, saved cache topology, SSR, deduplication, fetch options, connector protocols and realtime catch-up. The Monospace implementation attempt was too large a change and was reverted.
- No current connector supports it: Drizzle translates pages to `offset`/`limit` and pushes item events, not range results; Monospace pushes full offset-page results.

## When to revisit

When an infinite-scroll or multi-page live list needs rows not to be duplicated or skipped at page edges.

## Considered design

Modeled on Convex and InstantDB:

1. **Pinned bounds.** After a page first loads, record its end bound (sort tuple plus primary key of its last row, as an opaque connector-issued cursor). A pinned page is then requested as `(previous end, own end]` with no limit: it grows or shrinks but never shifts.
2. **Open tail.** Only the last page stays open (`after previous end`, `pageSize + 1` for `hasNext`). `fetchMore()` seals it at its accepted end cursor and opens a new tail, staged and committed atomically.
3. **Split and merge.** A pinned page growing past about `2 * pageSize` splits at a server-provided interior cursor; an empty page merges its range into its right neighbor so no interval goes unsubscribed.
4. **Reverse chunks.** Anchored windows load backwards with an inclusive reverse read; the default first range starts at negative infinity and needs none.
5. **Contracts.** Opt-in `pagination: 'cursor'` with `responseRefs` membership; reserved `findOptions.pageBounds` requests and `meta.$pageBounds` response descriptors; a connector capability flag; mandatory result versions (S04) per range; stable page ids instead of indexes; `refresh({ prune: true })` rejected; ranges that exceed server limits fail with an error instead of truncating.

Even with this, independently live ranges are only eventually consistent for rows moving across bounds; a single-snapshot union would need a coordinated multi-range protocol.
