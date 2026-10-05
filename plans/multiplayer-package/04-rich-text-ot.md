# 04: Server-ordered rich-text OT for block-node documents

## Context

A downstream product (a collaborative "software factory") stores rich-text documents as **node records**: one rstore row per ProseMirror/Tiptap block node, with a stable id. It wants rstore to replace Yjs.

Requirements:

- concurrent edits inside one node's text
- marks and formatting ranges
- per-user undo
- IME/composition safety
- offline divergence
- permission hooks
- awareness and presence

Today's tools do not cover this:

- `mergeText` is a state-based three-way merge with no order. It reports overlaps as conflicts, has no marks, and gives no convergence guarantee beyond two peers.
- Field LWW would drop one side of every concurrent edit in the same node.

## Decision summary

| Topic | Choice |
|---|---|
| Consistency model | Central sequencer per document (room), Jupiter-style client/server OT. Only TP1 is needed |
| Inline content | Delta-like ops (`retain`/`insert`/`delete`, attributes on `retain`/`insert`, length-1 embeds), as in Quill Delta / ShareDB `rich-text` |
| Structure | Node-addressed ops: `insertNode`, `deleteNode` (soft), `moveNode`, `setAttrs`, `splitNode`, `mergeNode`, each with defined transforms against text ops |
| Server role | Transform-on-receive (ShareDB). Reject-and-resync only when the base version is older than retention |
| Client role | ot.js state machine: `Synchronized` → `AwaitingConfirm` → `AwaitingWithBuffer` |
| Undo | Per-user selective undo: inverse ops of the user's own transactions, transformed against every later op |
| Indexes | UTF-16 code units (ProseMirror/DOM). Surrogate-splitting ops are rejected |
| Ordering of siblings | Fractional `orderKey` (Figma / `fractional-indexing`), ties broken by server version |
| Persistence | The sequencer appends the op log and upserts node rows in one transaction. Rows remain plain, queryable records |

## Data model

```ts
// packages/multiplayer/src/ot/types.ts
/** Inline content of a textblock node. */
export type Delta = DeltaInsert[]

export interface DeltaInsert {
  /** Text or a length-1 inline embed (mention, hard break, inline image). */
  insert: string | { [embedType: string]: unknown }
  /** Marks; `null` values only appear in format ops (mark removal). */
  attributes?: Record<string, unknown>
}

/** One block node stored as an rstore record. */
export interface DocNodeRecord {
  /** Stable, client-generated (UUIDv7). */
  id: string
  docId: string
  parentId: string | null
  /** Fractional index among siblings. */
  orderKey: string
  /** ProseMirror node type name. */
  type: string
  attrs: Record<string, unknown>
  /** Inline content for textblocks; `null` for containers (lists, tables, blockquotes). */
  content: Delta | null
  /** Soft delete: kept until retention GC so concurrent ops and undo still resolve. */
  deleted: boolean
  /** Document version that last changed this node (set by the sequencer). */
  version: number
}

/** Delta operation component on one node's inline content. */
export type TextOpComponent
  = | { retain: number, attributes?: Record<string, unknown | null> }
    | { insert: string | Record<string, unknown>, attributes?: Record<string, unknown> }
    | { delete: number }

/** Every op a transaction can contain. */
export type DocOp
  = | { t: 'text', node: string, ops: TextOpComponent[] }
    | { t: 'insertNode', node: Omit<DocNodeRecord, 'version' | 'deleted' | 'docId'> }
    | { t: 'deleteNode', node: string }
    | { t: 'restoreNode', node: string }
    | { t: 'moveNode', node: string, parentId: string | null, orderKey: string }
    | { t: 'setAttrs', node: string, attrs: Record<string, unknown | null> }
    | { t: 'splitNode', node: string, at: number, newNode: string, newType?: string, newAttrs?: Record<string, unknown>, orderKey: string }
    | { t: 'mergeNode', node: string, into: string }

/** Atomic unit sent by a client and sequenced by the server. */
export interface DocTransaction {
  docId: string
  clientId: string
  /** Client-local sequence, used to match acks. */
  seq: number
  /** Server version the ops were authored against. */
  baseVersion: number
  ops: DocOp[]
}
```

Wire frames, added to `/protocol`, versioned through `version.ts`:

| Frame | Direction | Payload |
|---|---|---|
| `collab:hello` | C→S | `docId`, `baseVersion?`, `pending?: DocTransaction[]` |
| `collab:snapshot` | S→C | `docId`, `version`, `nodes: DocNodeRecord[]` (redacted per peer) |
| `collab:submit` | C→S | `DocTransaction` |
| `collab:ack` | S→C | `docId`, `seq`, `version` |
| `collab:ops` | S→C | `docId`, `version`, `clientId`, `userId`, `ops` (already transformed) |
| `collab:reject` | S→C | `docId`, `seq`, `reason: 'forbidden' \| 'invalid' \| 'history-truncated' \| 'cycle'`, `resync?: boolean` |

## Algorithm

### Server: `@rstore/multiplayer/server/sequencer.ts`

For each document there is a single writer: one in-process actor, sticky-routed, or a Durable Object.

```text
on submit(tx):
  validate(tx)                              # shape, sizes, surrogate boundaries, node existence at baseVersion
  if tx.baseVersion < log.floor: reject('history-truncated', resync)
  concurrent = log.range(tx.baseVersion, head)
  ops' = transformTx(tx.ops, concurrent)    # incoming is "right"/later: loses insert ties
  for op in ops': hooks['collab.filterOp'] → reject('forbidden')     # all-or-nothing
  rows = applyToNodes(snapshot, ops')
  store.append(docId, head + 1, ops', rows) # CAS on version; op log + node upserts in one DB transaction
  ack(sender, tx.seq, head + 1); broadcast(collab:ops)
```

`OpLogStore` is an interface (`append`, `range`, `floor`, `snapshot`, `compact`). It ships with an in-memory implementation. The Drizzle implementation lives in `@rstore/nuxt-drizzle` in X2. The rstore realtime publisher then emits normal row frames for non-collab subscribers, such as document lists and search.

### Client: `@rstore/multiplayer/ot/client.ts`

This follows the ot.js state machine. At most one transaction is in flight and the rest are composed into one buffer, so the transform cost per remote op is O(|inflight| + |buffer|).

```text
local(tx):      Synchronized → send, AwaitingConfirm(tx)
                AwaitingConfirm(i) → AwaitingWithBuffer(i, tx)
                AwaitingWithBuffer(i, b) → AwaitingWithBuffer(i, compose(b, tx))
remote(ops):    i' , ops'  = transform(i, ops); b', ops'' = transform(b, ops'); apply(ops'')
ack:            AwaitingConfirm → Synchronized; AwaitingWithBuffer(i, b) → send b, AwaitingConfirm(b)
reject(seq):    apply(invert(i)); b' = transform(b, invert(i)); emit collabRejected; continue with b'
```

The cache sees the result like this:

- Confirmed state lives in committed rows, with `multiplayer:ot` item metadata `{ version }`.
- Inflight and buffered ops are applied through a cache layer (`addLayer`/`removeLayer`), exactly like optimistic mutations.
- Queries, relations and forms keep working on node rows.
- The multiplayer plugin's `cacheBeforeWriteItem` drops row frames for OT nodes whose `version` is not newer than the metadata, which avoids double application through realtime.

### Transforms: `ot/transform.ts`, `ot/structure.ts`

| A (sequenced first) ∖ B (transformed) | Effect on B |
|---|---|
| text vs text, same node | Delta `transform` (A has priority on insert ties at the same index) |
| `splitNode(n, at, m)` vs text on `n` | Components at index ≥ `at` move to `m`, shifted by `-at`. An insert exactly at `at` stays in `n` (left affinity) |
| `mergeNode(n into p)` vs text on `n` | Retargeted to `p`, shifted by `len(p)` at A's version |
| `deleteNode(n)` (soft) vs any op on `n` | Still applied to the hidden node, so undo and restore keep concurrent edits |
| `moveNode` vs `moveNode` (same node) | Server order wins (LWW by version). A move that would create a cycle is rejected (`cycle`) |
| `setAttrs` vs `setAttrs` | Per-key LWW by server order |
| `insertNode` vs `insertNode` with equal `orderKey` and parent | Both kept. Reads order by `(orderKey, version, id)` |
| `splitNode` vs `splitNode` (same node) | The second split's `at` is mapped through the first. If it falls in the first's tail, it retargets to the new node |

The server needs TP1 only, because it imposes a total order and clients transform against a linear history (Jupiter). TP2 and the puzzles that come with it (dOPT, Ellis & Gibbs) do not apply.

### Marks: `ot/marks.ts`

- **Authoring.** Inserts carry explicit attributes chosen by the editor (ProseMirror `storedMarks`, mark `inclusive`), so boundary expansion is decided by the author and is deterministic.
- **Format ops.** These are `retain` components with attributes; `null` removes a mark.
- **Known anomaly** (described in Peritext). If A bolds "hello world" while B types inside it concurrently, B's characters stay unbolded under plain Delta transform.
  - Mitigation: a per-mark-type `expandOnConcurrentInsert` policy, applied in `transform` when an insert falls strictly inside a concurrent format range.
  - X1 measures whether the default matches user expectations. The default is `true` for `bold`/`italic`/`code` and `false` for `link`/`comment`.
- **Overlapping marks** of the same type with different values (e.g. two link hrefs): the later sequenced op wins per character.
- **Comments and anchors.** These are marks with an id attribute. Marks of distinct ids coexist (key `comment:<id>`).

### Per-user undo: `ot/undo.ts`

- **Stack.** Each client keeps its own undo/redo stacks of inverse transactions, computed at apply time with Delta `invert(op, preState)` plus structural inverses.
  - `deleteNode` ↔ `restoreNode`
  - `insertNode` ↔ `deleteNode`
  - `split` ↔ `merge`
  - `setAttrs` ↔ previous values
- **Rebasing the stack.** Every remote op transforms every stack entry, as in the ot.js `UndoManager` and the selective undo of Ressel & Gunzenhäuser 1999 / Sun 2002. The client never undoes another user's op.
- **Grouping.** Consecutive local transactions in the same node within 500 ms form one group, and a composition is always one group.
- **Limits.**
  - Undoing an insert whose characters another user deleted is a no-op.
  - Undoing a format over text that others replaced applies only to the surviving characters.
  - Undoing a split after someone typed in the tail merges their text back. This is acceptable, since it is visible.
  - A redo stack entry is dropped when its transform yields an empty op.

### IME/composition safety: `ot/composition.ts`

- **Signals.** The binding reports `compositionStart(nodeId)` / `compositionEnd(nodeId)` from ProseMirror (`view.composing`, `compositionstart`/`compositionend`).
- **Local ops during composition** in that node are not sent. On `compositionEnd`, the binding diffs the node's text before and after (`/text/diff.ts`) and emits **one** transaction. Intermediate browser transactions (Android, Safari) are therefore never transmitted.
- **Remote ops for the composing node** go through the state machine, transformed against the pending composition. They are dispatched to the view only after `compositionEnd`.
  - Remote ops for other nodes are dispatched immediately.
  - A safety valve (X1 measures it) force-flushes after `maxCompositionHoldMs` (default 10 s) or 500 queued ops.
- **Presence.** Local cursor broadcasts pause during composition.

### Offline divergence: `ot/pending.ts`

- **Persistence.** Pending inflight and buffer transactions, the confirmed snapshot of touched nodes and `baseVersion` go to a `KeyValueStorage` (the IndexedDB adapter exported by `@rstore/offline`, [03](./03-package-layout.md#rstoreoffline-stays-separate-d8)). They are composed per node to bound the size.
- **Reconnect.** `collab:hello { baseVersion, pending }`. The server transforms pending ops against `(baseVersion, head]`, which is the normal path, possibly long.
- **History truncated** (`baseVersion < floor`): the server replies `collab:reject { reason: 'history-truncated', resync: true }` plus a snapshot. The client then runs a fallback merge per touched node.
  - It runs a three-way `mergeText` on plain text (persisted base, local, server), then reapplies local marks by mapped ranges.
  - When the merge conflicts, the client inserts a **conflict copy** node (`attrs.conflictOf = id`) after the original instead of dropping text.
  - It emits `collabConflict`.
- **Retention.** The default op log retention is max(30 days, last 100k ops) per doc, with a snapshot every 1k ops. Both are configurable on `OpLogStore`.

### Permission hooks: `server/hooks.ts`

| Hook | When | Can |
|---|---|---|
| `collab.authorize` | first frame per (peer, doc) | `reject()`, `setUserId()`, `setRole(role)` |
| `collab.filterOp` | per transformed op, before apply | `reject(reason)`. Has the node pre-state, so locked blocks, comment-only roles and size caps can be checked |
| `collab.redact` | snapshots and broadcasts, per peer | return `null` to hide a node or a reduced node. Ops on hidden nodes are not sent to that peer |
| `multiplayer.authorize` / `multiplayer.filter` | presence frames (existing) | unchanged |

Rejection is all-or-nothing per transaction. The client rolls back with `invert(inflight)` (see the state machine above).

### Awareness and presence

- **Cursors.** They reuse `/presence`, with a document cursor `{ anchor: { nodeId, offset }, head: { nodeId, offset }, version }`. Receivers map positions from `version` to their current state through the op log tail (`transformPosition`), which replaces today's string-diff based `rebaseTextRange`.
- **Typing indicators.** `multiplayer:typing { target: { docId, nodeId } | null }`, carrying no content and expiring after 3 s.
- **Rates.** Presence is throttled to 20 Hz. Heartbeat and stale timeouts stay at 5 s / 15 s.

### Editor binding

The ProseMirror/Tiptap binding maps PM `Step`s to `DocOp`s and back, maps the PM schema to node records, and renders remote cursors as decorations.

- **Location.** `@rstore/multiplayer/prosemirror` with `prosemirror-model`, `prosemirror-state` and `prosemirror-transform` as optional peer dependencies.
- **Fallback.** If optional peers break consumers' installs in X1, it moves to a separate `@rstore/prosemirror` package.
- **Tiptap.** Tiptap uses it through a ~50-line extension in the product, not in rstore.

## Limits vs Yjs

| Area | rstore OT | Yjs |
|---|---|---|
| Topology | Needs the sequencing server online to **confirm** edits. Offline edits stay local until reconnect | Peer-to-peer or any relay; merges without a server |
| Long offline | Bounded by op log retention; past it, a lossy fallback (conflict copies) | Merges arbitrary divergence (state vectors) |
| Storage | Plain rows (SQL-queryable, row-level permissions) plus an op log that can be compacted | Opaque binary doc; tombstone metadata grows (mitigated by GC, not removed) |
| Permissions | Per-op and per-node server checks, redaction per peer | All-or-nothing per doc; per-node read ACL is hard |
| Correctness surface | Hand-written transforms per op pair (8 op types → ~36 pairs). TP1 only | Proven sequence CRDT (YATA); structure through nested types |
| Interleaving | No interleaving anomaly: the server orders whole inserts | YATA can interleave concurrent inserts at the same position in rare cases (Fugue paper) |
| Rich text | Peritext-style anomalies need the expand policy | `Y.Text` formatting has similar anomalies |
| Undo | Per-user, transformed stacks (built here) | `Y.UndoManager` with tracked origins (mature) |
| Scaling | Single writer per doc (sticky routing / Durable Object) | Stateless relays possible |
| Ecosystem | New; bindings and tooling to build | Mature bindings (y-prosemirror, Tiptap Collaboration), awareness, providers |

Use it when documents must be first-class rows (queries, relations, permissions, server-side automation) and a server is always part of the system.

## Spike X1

Time-box: 3 weeks, 1 engineer. The output is code under `packages/multiplayer/src/ot/` and `src/server/` on a branch, a benchmark report and a go/no-go note in this folder (`04a-spike-report.md`).

### Steps

1. **Text OT core.** Delta `apply`/`compose`/`transform`/`invert`/`transformPosition`, plus surrogate validation. Property tests first (fast-check):
   - TP1 holds for `transform`.
   - `apply(apply(s, a), invert(a, s)) = s`.
   - `compose(a, b)` ≡ apply a then b.
   - `transformPosition` is monotonic.
2. **Structure ops.** Transforms for the table above, with property tests over a random node tree.
3. **Sequencer and client state machine.** In-memory transport with injectable latency, reordering and drops per link (but FIFO per connection, as with WebSocket).
4. **Fuzz harness.** N simulated clients, random transactions (text, format, split/merge, move, delete/restore, undo), random delivery delays, random disconnect/reconnect with pending replay.
5. **ProseMirror binding prototype.** Tiptap StarterKit doc, 2–5 Playwright bots, plus CDP IME.
6. **Baseline.** The same scenarios on Yjs (y-prosemirror) for comparison.

### Exit criteria (all must pass for "go")

| # | Criterion | Measure |
|---|---|---|
| E1 | Convergence | 10 000 fuzz runs × {3, 5, 8} clients × 200 tx each: 0 divergent final states (clients == server snapshot) |
| E2 | TP1 and inverse properties | 100 000 fast-check cases per op pair: 0 failures |
| E3 | Intention preservation | A 40-scenario table (concurrent insert/format, split during typing, merge during typing, move during edit, delete/restore during edit, mark boundaries) matches the expected outcomes written before implementation |
| E4 | Undo | 25 per-user undo scenarios pass. Fuzz: undo never removes characters authored by another client (0 violations in 10 000 runs) |
| E5 | IME | Playwright Chromium, CDP `Input.imeSetComposition`, 200 runs of composition plus a concurrent remote typist in the same node: 0 lost or duplicated characters. Manual checklist passes on Safari macOS (Japanese), iOS Safari and Android Gboard |
| E6 | Offline | Client offline for 1 000 tx while 3 others make 1 000 tx: convergence after reconnect in < 2 s (p95, laptop). With history truncated, 0 characters lost (all surviving text appears in the original or a conflict copy) |
| E7 | Latency/CPU | Client `transform` + `apply` of 1 remote tx against 100 pending ops on a 10 000-character node: p95 < 1 ms. Server sequencer ≥ 2 000 tx/s per doc on one Node core (in-memory log) |
| E8 | Wire size | Median keystroke frame ≤ 200 bytes (JSON). Within 2× of Yjs update size on the same trace |
| E9 | Memory | 200-block doc, 5 bots, 10 minutes: client heap growth < 10 MB after GC; server per-doc memory bounded by snapshot plus retention |
| E10 | Permissions | Forbidden ops are rejected and rolled back with clients converging (fuzz with 10% forbidden ops: E1 still 0 divergence) |

**No-go fallback.** If E1–E4 pass but E5 or E6 fail, ship X2 without the failing capability behind a flag and record the gap. If E1 or E2 fail after the time-box, stop: recommend keeping Yjs for rich-text bodies and rstore rows for metadata.

### Productization X2 (only after "go")

- **Promotion.** Move the spike code to `/ot`, `/server/sequencer.ts`, `/server/oplog.ts` and `/prosemirror`. Keep files under 300 lines.
- **Adapters.**
  - `collab` options in `@rstore/nuxt-multiplayer-server`.
  - `useRstoreCollabDocument(docId)` in `@rstore/nuxt-multiplayer`.
  - Drizzle `OpLogStore` in `@rstore/nuxt-drizzle`.
- **Docs.** A `docs/guide/data/collaboration.md` page.

## References

- C. Ellis, S. Gibbs. *Concurrency control in groupware systems.* SIGMOD 1989.
- D. Nichols, P. Curtis, M. Dixon, J. Lamping. *High-latency, low-bandwidth windowing in the Jupiter collaboration system.* UIST 1995.
- D. Wang, A. Mah, S. Lassen. *Google Wave Operational Transformation* (whitepaper), 2010.
- T. Baumann. *ot.js*: client/server state machine and `UndoManager` (github.com/Operational-Transformation/ot.js).
- ShareDB and the `rich-text` OT type (Quill Delta: `transform`, `compose`, `invert`, `transformPosition`).
- M. Haverbeke. *Collaborative Editing in ProseMirror*, 2015 (`prosemirror-collab`).
- M. Ressel, R. Gunzenhäuser. *Reducing the problems of group undo.* GROUP 1999.
- C. Sun. *Undo as concurrent inverse in group editors.* ACM TOCHI 2002.
- G. Litt, S. Lim, M. Kleppmann, P. van Hardenberg. *Peritext: A CRDT for collaborative rich text editing.* CSCW 2022.
- P. Nicolaescu, K. Jahns, M. Derntl, R. Klamma. *Near real-time peer-to-peer shared editing on extensible data types* (YATA). GROUP 2016.
- M. Weidner, M. Kleppmann. *The Art of the Fugue: Minimizing interleaving in collaborative text editing*, 2023.
- D. Sun, C. Sun, A. Ng, W. Cai. *Real differences between OT and CRDT in correctness and complexity for consistency maintenance in co-editors.* PACMHCI (CSCW) 2020.
- E. Wallace. *Realtime editing of ordered sequences* (Figma blog), 2017; `fractional-indexing` (Rocicorp).
- S. Kulkarni, M. Demirbas, et al. *Logical physical clocks* (HLC). OPODIS 2014.
