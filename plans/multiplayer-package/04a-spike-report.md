# 04a: Rich-text OT spike X1, report

- Date: 2026-10-03
- Scope: [04 Spike X1](./04-rich-text-ot.md#spike-x1), exit criteria E1–E6 (E7, E8 and E10 measured on the side), downstream requirements from the product review ("one document sync model").
- Code (uncommitted working tree): `packages/multiplayer/src/{ot,server,prosemirror,protocol}`, tests in `packages/multiplayer/test/{ot,prosemirror,protocol}` and `packages/multiplayer/e2e`.

## Verdict

**Go for X2, conditional.** E1–E4, E6 and E10 pass at the scale the plan asks for; E5 passes its automated half (Chromium + CDP) and still needs the manual device matrix; E7 passes; E8 fails as specified (JSON frames with three UUIDs are 262 bytes) and E9 was not run. Per the plan's rule ("all must pass for go", "if E5 or E6 fail, ship X2 without the capability behind a flag"), X2 can start on the engine, the sequencer and the binding, with two gates kept open before a default-on release: the E5 manual matrix (Safari macOS Japanese, iOS Safari, Android Gboard), and E8/E9 (wire compaction, soak test). Nothing points to the "stop, keep Yjs" branch: E1 and E2 found no divergence.

Main risk observed: under the adversarial fuzz (random merges into random targets, cross-moves, concurrent deletes, 10% forbidden ops), 1.4–2.3% of transactions without forbidden ops lose some op to a rejection (`conflict` 0.6–1.1%, `invalid` 0.8–1.2%, the latter mostly ops that depended on a dropped one). Rejected transactions are bisected, so only those ops are rolled back, and every client converges; real editing produces far fewer same-target merges and cycles than the fuzz.

## Exit criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| E1 | 10 000 runs × {3, 5, 8} clients × 200 tx: 0 divergence | **Pass** | 30 000 runs, 32 M transactions, 0 divergent runs (every client record-equal to the server, versions included, all synchronized). Mix: text/format 55%, split 10%, merge 5%, insert 8%, delete 6%, move 6%, attrs 4%, type 2%, plus undo/redo (9.4 M), random delivery per FIFO link and 213 591 disconnect/reconnects with pending replay |
| E2 | 100 000 fast-check cases per op pair: 0 failures | **Pass** | 9 op types (the plan's 8 plus `setType`): 81 ordered pairs × 100 000 TP1 cases, 9 × 100 000 inverse cases, and the text properties (TP1, inverse, compose, position monotonicity, end mapping) × 100 000: 0 failures (44 min for the structure suite). Validity is symmetric: when the server's transformed op is invalid (cycle), so is the author's |
| E3 | 40 scenarios match expected outcomes written before the implementation | **Pass** | `test/ot/scenarios/*`: 14 text/mark, 14 split/merge, 12 move/delete/attrs/insert scenarios, 63 runs counting both arrival orders where the outcome must not depend on it; server and both clients checked |
| E4 | 25 undo scenarios; fuzz: undo never removes another client's characters | **Pass** | `test/ot/undo.spec.ts` (25); fuzz: 0 violations over 9.4 M undos/redos without forbidden ops and 9.7 M with (visible characters authored by others, measured before/after each undo) |
| E5 | Chromium CDP IME, 200 runs with a concurrent remote typist: 0 lost or duplicated characters; manual matrix | **Automated part passes; manual matrix not run** | `e2e/ime.spec.ts`: 200 compositions (`Input.imeSetComposition` steps then `Input.insertText`) in editor A while editor B types 2–4 characters into the same paragraph through the in-page sequencer with random latency: 0 failures, 481 remote transactions arrived mid-composition, all editors equal the server. Safari macOS (Japanese), iOS Safari and Android Gboard checklists are still to be run by hand |
| E6 | 1 000 offline tx vs 3 others × 1 000 tx: convergence < 2 s p95; truncated history: 0 characters lost | **Pass** | 20 runs: reconnect-to-converged p95 143 ms, max 271 ms (load average 14 on 32 cores; 724 ms p95 at load 80). Offline characters visible after convergence ≥ before in all 20 runs. Truncated history (op log compacted to nothing): 20 runs, 0 offline characters lost, 0–3 conflict copies per run; some runs show the offline text twice (a node merged offline that the server kept), never less |
| E7 | Client transform + apply p95 < 1 ms; sequencer ≥ 2 000 tx/s | **Pass** | 1 remote tx against 100 unfoldable pending ops on a 10 000-character node: p50 0.10 ms, p95 0.21 ms. Sequencer on the in-memory log, each tx rebased once: 198 800 tx/s (36 900 tx/s at load 73) |
| E8 | Median keystroke frame ≤ 200 bytes | **Fail** | 262 bytes with UUID doc, client and node ids; 168 bytes once the frame stops repeating the `docId`/`clientId` the connection already knows (X2). Yjs comparison not run |
| E9 | Memory soak | Not run | — |
| E10 | 10% forbidden ops, E1 still 0 divergence | **Pass** | 30 000 runs (3/5/8 clients) with 10% forbidden `setAttrs`: 0 divergence, 0 undo violations; refused ops rolled back on their author only |

Quality checks: 21 fault injections in a scratch copy (insert tie order, format LWW, mark expansion, surrogate check, split-point affinity, split re-keying, merge revival, inflight rebase, bisection, dedupe, `filterOp`, redaction, undo foreign filter, undo rebase, composition hold, conflict copy, split detection in the binding, IME diff during composition (E5), protocol negotiation, version stamping, pruning after rollback): all 21 caught by the suites.

## How to reproduce

| Gate | Command (from the repo root unless noted) |
|---|---|
| E1, E4, E10 | `RSTORE_OT_FUZZ_RUNS=1000 RSTORE_OT_FUZZ_TX=200 RSTORE_OT_FUZZ_CLIENTS=8 RSTORE_OT_FUZZ_FORBIDDEN=0.1 RSTORE_OT_FUZZ_SEED=1 RSTORE_OT_FUZZ_REPORT=fuzz.jsonl pnpm vitest run --project unit packages/multiplayer/test/ot/fuzz.spec.ts`, one process per 1 000-seed chunk and configuration (60 chunks) |
| E2 | `RSTORE_OT_PROPERTY_RUNS=100000 pnpm vitest run --project unit packages/multiplayer/test/ot/structure.property.spec.ts packages/multiplayer/test/ot/delta.property.spec.ts` |
| E3, E4 scenarios | `pnpm vitest run --project unit packages/multiplayer/test/ot/scenarios.spec.ts packages/multiplayer/test/ot/undo.spec.ts` |
| E5 | `RSTORE_OT_IME_RUNS=200 pnpm --filter @rstore/multiplayer test:e2e` |
| E6 | `RSTORE_OT_OFFLINE_RUNS=20 RSTORE_OT_OFFLINE_TX=1000 RSTORE_OT_OFFLINE_REPORT=offline.jsonl pnpm vitest run --project unit packages/multiplayer/test/ot/offline.spec.ts` |
| E7, E8 | `RSTORE_OT_PERF=1 RSTORE_OT_PERF_REPORT=perf.jsonl pnpm vitest run --project unit packages/multiplayer/test/ot/perf.spec.ts` |

The default unit suite runs the same specs at small scale (12 fuzz runs per configuration, 300 property cases, 3 offline runs).

## Design as built

### Modules

| Module | Content |
|---|---|
| `ot/delta/*` | Delta `applyTextOp` (with surrogate and shape validation), `composeTextOps`, `transformTextOp` (insert ties: first sequenced first; format conflicts: later sequenced wins; mark expansion), `invertTextOp`, `transformTextPosition`, code-point safe `diffDelta`/`diffPlainText` (fixes the `diffText` surrogate split for OT) |
| `ot/doc/*` | Node-record state, all-or-nothing `applyDocOps`, `invertDocOps`, the pair transforms (`pairs.ts`) and list transforms (`transformDocOps`, `rebaseDocOps`, op by op `rebaseDroppingConflicts`), buffer composition |
| `ot/authoring.ts`, `ot/orderKey.ts` | Op builders that compute fractional keys (`insertNodeOp`, `moveNodeOp`, `splitNodeOp`, `mergeNodeOp`); keys are Rocicorp's base-62 fractional indexing, rewritten in-package |
| `ot/client*.ts` | ot.js state machine with `confirmed` (server mirror) and `state` (view), rollback, bisection of rejected transactions, reconnect catch-up with pending resubmit, snapshot fallback |
| `ot/undo.ts` | Per-user selective undo, 500 ms typing groups, `stopCapturing()` for compositions |
| `ot/composition.ts` | IME guard: holds remote ops for the composing node, one diffed transaction at `compositionend`, safety valve (10 s / 500 ops) |
| `ot/pending.ts`, `ot/fallback.ts` | Pending persistence over a `KeyValueStorage`, three-way per-node merge with marks and conflict copies after history truncation |
| `server/sequence.ts`, `server/oplog.ts` | Stateless `sequenceTransaction(store, tx)` and pure `rebaseTransaction(tx, opsSince)`; `OpLogStore` interface and in-memory store with retention |
| `server/collabServer.ts`, `server/redact.ts` | `collab:*` frame handling, per-document serialization, broadcasts with per-peer redaction, `submitServer` |
| `protocol/collab*.ts`, `protocol/version.ts` | Frame types and guards, protocol version negotiation |
| `prosemirror/*` | Conversions (records ↔ PM nodes, marks ↔ Delta attributes), document diff (Enter/Backspace recognized as split/merge), remote ops as PM steps, the plugin (ids, submit, remote apply, composition, undo commands), `withNodeIds` |

### Downstream requirements

| Requirement | Where |
|---|---|
| Stateless `sequence(tx, opsSince)` + pluggable `OpLogStore` (Postgres supplied downstream) | `rebaseTransaction(tx, opsSince)` is pure; `sequenceTransaction(store, tx)` keeps no state and appends with compare-and-set, retried on contention (tested with two writers on one store) |
| Idempotent resubmit keyed `(clientId, seq)` | `store.findSubmission`; duplicates are re-acked with the stored version, never re-applied; hello `pending` skips sequenced transactions |
| `submitServer` for server-authored ops | `server.submitServer(docId, ops, { baseVersion, clientId, seq, userId })`, rebased like a client transaction and broadcast to every peer |
| Version-only no-op frames for hidden nodes | `collab.redact` returning `null` hides a node; ops touching only hidden nodes reach that peer as `collab:ops` with `ops: []` |
| Delta-format marks (D21) | Marks are Delta attributes (`{ bold: true }`, `{ link: { href } }`); comment anchors are `comment:<id>` keys |
| Node records with block-level ids | One `DocNodeRecord` per block; ids survive split (new id), merge/undo (revival), type changes (`setType`) |
| ProseMirror/Tiptap binding upstream | `@rstore/multiplayer/prosemirror`; Tiptap can wrap `collabPlugin` in an extension |
| Per-user undo | `createCollabUndoManager(client)` |
| IME composition hold | `createCompositionGuard`, wired by the plugin |
| Offline divergence with conflict-copy fallback | Rebase within retention; per-node merge plus conflict copies after truncation |

### Remaining work for X2

- Cache integration on S3: committed rows with `multiplayer:ot` item metadata, pending ops in a cache layer, row-frame dedupe by version.
- Drizzle/Postgres `OpLogStore` (`append` as one transaction: op log row, unique `(doc, version)` and `(doc, client_id, seq)`, node upserts), and `compact` in the interface.
- Wire compaction for E8 (frames repeat `docId` and `clientId` the connection already knows).
- Redaction of ops mixing hidden and visible nodes (today: sent unredacted), and reduced (not hidden) nodes in op broadcasts.
- Yjs baseline (E8 ratio), E9 memory soak, E5 manual device matrix.

## X2 follow-up (2026-10-03)

Gates left open by X1, measured on the X2 code (protocol 2, redaction rewrites, cache integration). Implementation notes: [06, X2](./06-slices.md#x2-implementation-notes-2026-10-03).

| # | Result | Evidence |
| --- | --- | --- |
| E8 | **Pass** (size); Yjs ratio: pass with `permessage-deflate`, ~5.3x raw | Protocol 2 channel frames, UUID ids, 1 000 keystrokes on a 2 000-character paragraph: median `collab:submit` 166 bytes, `collab:ops` 160 bytes (X1: 262). Yjs baseline (same trace on a y-prosemirror-shaped `Y.XmlFragment`, update + 3-byte y-websocket header): 30 bytes raw. With `permessage-deflate` (context takeover): OT 16 / 12 bytes, Yjs 10–13 bytes, ratio 1.1x (typing at the caret) and 0.9x (scattered). `RSTORE_OT_PERF=1 … perf.spec.ts` |
| E9 | **Pass** | `RSTORE_OT_SOAK_MS=600000 pnpm --filter @rstore/multiplayer exec playwright test -c e2e/playwright.config.ts soak`: 5 ProseMirror bots on a 200-block document in one Chromium page (clients and in-page sequencer), 10 minutes (1 minute warm-up), 12 076 edits (typing, deletions, Enter/Backspace keeping ~200 blocks, undo), 11 971 versions. Heap after GC: 5.3 MB → 7.3 MB (+2.0 MB over 9 minutes, samples 5.3–7.4 MB, no trend); the text grew by ~10 000 characters and 792 merged blocks stayed as soft-deleted records in 6 states. Op log retained 2 971 entries (`minOps` 2 000, compaction every 1 000 versions): server memory per document is the rows plus the retention window. All editors equal the server. A first run without the block-count balance grew to 873 blocks and +10 MB: document growth, not a leak |
| E5 | Manual matrix still to run | Script: [04b](./04b-ime-manual-matrix.md) |
| E1/E4/E10 regression | **Pass** | 500 runs × {3, 5, 8} clients × {0, 10%} forbidden × 200 tx on the X2 code (run again after the fallback fix, same totals): 3 000 runs, 3.2 M transactions, 0 divergent runs, ~1.0 M undos/redos, 0 undo violations |
| E7 regression | **Pass** | Client transform + apply p95 0.30 ms; sequencer 132 000 tx/s (in-memory log, machine under fuzz load) |
| Redaction fuzz (new) | **Pass** | `RSTORE_OT_REDACT_*` in `redaction.spec.ts`: textblocks created by c0 hidden from c1, 500 runs × 2 chunks × {4, 8} clients × 100 tx: 2 000 runs, 1.2 M transactions, ~414 000 undos/redos, 0 divergent runs (every client equal to its redacted view of the server), 0 undo violations. A first campaign found 2 undo violations (seeds 545 and 134), both from the snapshot merge fallback a redacted client runs after a reload: matching characters by plain-text diff, it took another user's character for one the client had deleted and retyped, and applied its own marks to it (re-labelling the author mark, so that user's later undo of the character counted as removing foreign text). Fixed in the fallback, see [06](./06-slices.md#x2-follow-up-undo-anomalies-of-the-snapshot-merge-fallback-2026-10-03) |
| E6 regression | **Pass** | 20 runs × 1 000 offline tx vs 3 × 1 000: convergence p95 313 ms (machine under fuzz load), offline characters visible after ≥ before in all runs; truncated history: 20 runs, 0 offline characters lost, 0–3 conflict copies |
