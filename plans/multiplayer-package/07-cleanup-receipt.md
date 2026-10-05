# Multiplayer cleanup receipt

- Branch: `cleanup-multiplayer`
- Base: `c65c9f1`
- Scope: package extraction, cache extension points, Nuxt adapters, Drizzle op-log adapter, offline metadata persistence, docs and embedded skills.

## Delivered boundary

- `@rstore/multiplayer` owns HLC, LWW/tombstones, text merge, presence,
  protocol, collab OT, sequencer, op-log interfaces and ProseMirror binding.
- `@rstore/core`, `@rstore/shared` and `@rstore/vue` keep generic cache
  metadata, interception, item lifecycle and form field-merge extension
  points. Their old multiplayer APIs are limited to documented 0.9 shims.
- Cache write causality moves into `metadata` so generic cache paths never
  inspect LWW fields. `createMultiplayerPlugin()` restores LWW, tombstone GC
  and text field merge when an application needs them.
- `@rstore/nuxt-multiplayer` and `@rstore/nuxt-multiplayer-server` remain
  Nuxt adapters. Their transport-neutral implementation lives in
  `@rstore/multiplayer`.
- `@rstore/nuxt-drizzle` uses the multiplayer clock and provides a durable
  collab op-log adapter. Its append guard and outbox callback run in the same
  database transaction; committed ingress is delivered to other hosts.

## Friction fixed during cleanup

| Finding | Repair | Proof |
| --- | --- | --- |
| Public entry inventory omitted `clearPendingState` and `OpLogAppendRejected`. | Listed both intentional API names in the exact-export contract. | `packages/multiplayer/test/exports.spec.ts`; multiplayer test: 532 passing, 3 skipped. |
| PostgreSQL op-log contract imported PGlite without a lockfile importer entry. | Added its resolved importer through `pnpm install --no-frozen-lockfile`; frozen install now succeeds. | `packages/nuxt-drizzle/package.json`, `pnpm-lock.yaml`; `pnpm install --frozen-lockfile`. |
| `onAppend` test callback returned `Array#push` count. | Used block body so callback conforms to its public `void | Promise<void>` contract. | `packages/nuxt-drizzle/test/integration/collab-oplog.spec.ts`; repository type check. |

## Validation

- `pnpm install --frozen-lockfile`
- `pnpm test` — 282 files passed, 1 skipped; 2,278 tests passed, 3 skipped.
- `pnpm test:types`
- `pnpm run build`
- `pnpm lint`

## Follow-up boundaries

- Manual IME behavior still needs Safari macOS, iOS Safari and Android Gboard
  coverage. It is documented as experimental; automated OT tests do not prove
  those device interactions.
- Publish only through the pull-request nightly workflow. Do not use the
  official release script for this preview package set.
