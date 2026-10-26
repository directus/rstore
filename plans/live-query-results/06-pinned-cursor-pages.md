# S06: pinned cursor pages

- Status: rejected 2026-10-25 ([ADR](./adr-pinned-cursor-pages.md)). No code; follow-ups P01–P05 not planned.

## Outcome

None shipped. Numbered-page tables follow only the displayed offset page (S03) and receive pushes through `setResult` (S02), which is correct for that UI. A cursor-bounded implementation was started for Monospace, judged too much change, and reverted.

## Problem considered

Offset pages are each consistent on their own but not with each other: an insert before page k shifts every later page, so rows are duplicated or skipped at page edges. This matters for infinite-scroll and "load more" lists that show several pages at once, not for one-page-at-a-time tables.

## Notes

- Revisit only for an infinite-scroll or multi-page live list. The [ADR](./adr-pinned-cursor-pages.md#considered-design) keeps a compact summary of the considered design.
- Docs (`docs/guide/data/{live,query}.md`) say pinned windows are "not supported yet". No runtime API exists; this proposal is rejected, with no follow-up scheduled.
