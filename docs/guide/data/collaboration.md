# Collaboration <Badge text="New in v0.9" /> <Badge text="Experimental" type="warning" />

`@rstore/multiplayer` holds everything rstore needs for multi-user editing. It is framework-agnostic and depends only on `@rstore/shared`:

| Entry | Content |
| --- | --- |
| `@rstore/multiplayer` | `createMultiplayerPlugin()`: field-level last-writer-wins (LWW), tombstones, conflict policies and form text merge, plus store helpers |
| `@rstore/multiplayer/clock` | Hybrid Logical Clock (HLC) timestamps |
| `@rstore/multiplayer/lww` | Field merge, tombstones and conflict policies as plain functions |
| `@rstore/multiplayer/text` | Text diff, three-way merge and cursor rebasing |
| `@rstore/multiplayer/presence` | Presence channel: peers, focused fields, cursors and typing indicators |
| `@rstore/multiplayer/protocol` | Wire frame types, guards and sanitization |
| `@rstore/multiplayer/server` | Transport-agnostic room server: authorization, identity, rate limits, origin checks; collab document sequencer and op log stores (experimental) |
| `@rstore/multiplayer/ot` | Collab documents: rich-text operational transformation, client, per-user undo, IME guard (experimental) |
| `@rstore/multiplayer/prosemirror` | ProseMirror binding of collab documents (experimental) |

```sh
pnpm i @rstore/multiplayer
```

Which tool to use:

- **Realtime rows (LWW).** Rows pushed by a server (WebSocket, SSE) carry per-field timestamps; the plugin keeps the newest value of each field and drops writes older than a delete. Use it whenever stamped frames reach the cache. [Nuxt + Drizzle](../../plugins/nuxt-drizzle.md#realtime) installs it for you.
- **Forms (`$rebase`).** A form being edited while remote changes arrive keeps local edits; the plugin merges non-overlapping text edits instead of reporting a conflict. See [Form Object](./form.md#rebasing-and-conflicts-for-collaboration).
- **Presence.** Who is in the room, which field they focus, their caret and whether they are typing. Nothing is stored in the cache.
- **Rich-text documents (OT).** Several people typing in the same paragraph, with marks, per-user undo and IME input, documents stored as one row per block and ordered by a server. See [Collaborative documents](./collaborative-documents.md).

## Plugin setup

```ts
import { createMultiplayerPlugin } from '@rstore/multiplayer'
import { createStore } from '@rstore/vue'

const store = await createStore({
  schema,
  plugins: [
    remotePlugin,
    createMultiplayerPlugin(),
  ],
})
```

In Nuxt, add it in a file of your rstore plugins folder:

```ts
// app/rstore/plugins/multiplayer.ts
import { createMultiplayerPlugin } from '@rstore/multiplayer'

export default createMultiplayerPlugin()
```

| Option | Default | Description |
| --- | --- | --- |
| `lww` | `true` | Field-level LWW merge of stamped writes and tombstones of stamped deletes. `false` disables both. An object restricts it: `{ collections: ['todos'] }` (or a function of the collection) and `conflictPolicy` (see [Conflicts](#conflicts)). |
| `tombstoneGc` | `{ intervalMs: 60_000, ttlMs: 86_400_000 }` | Periodic removal of old tombstones, on clients only. `false` disables it. The timer stops when the cache is disposed. |
| `formTextMerge` | `true` | Merge non-overlapping concurrent text edits during form `$rebase`. |

Install the plugin **once** per store. Without it, stamped writes overwrite the cached row and deletes leave no tombstone; in development the cache warns about the unhandled `fieldTimestamps`/`deletedAt` metadata.

## Stamped writes

Realtime frames reach the cache through [write metadata](./cache.md#write-metadata):

```ts
store.$cache.writeItem({
  collection,
  key: frame.key,
  item: frame.record,
  metadata: { fieldTimestamps: frame.fieldTimestamps },
})

store.$cache.deleteItem({
  collection,
  key: frame.key,
  metadata: { deletedAt: frame.deletedAt },
})
```

- `fieldTimestamps` maps field names to HLC strings (`physicalHex:logicalHex:nodeId`, from `@rstore/multiplayer/clock`) or numbers. For each field, the newest stamp wins; fields of a write without a stamp are taken as they are.
- `deletedAt` records a **tombstone**. A later write older than the tombstone is dropped, so a delayed frame cannot resurrect a deleted row. A write newer than the tombstone recreates the row and clears it.
- Mutations accept the same metadata: `store.todos.update(item, { metadata: { fieldTimestamps } })`.
- Writes without stamps (query results, local mutations) keep the stamps already stored for the row.

Stamps and tombstones are [item metadata](./cache.md#item-metadata) (`multiplayer:fields`, `multiplayer:tombstone`): they are serialized with the SSR state and persisted by the [offline plugin](./offline.md#persisted-item-metadata).

```ts
import { gcTombstones, getFieldTimestamps, getTombstone, setFieldTimestamps, tombstoneEntries } from '@rstore/multiplayer'

getFieldTimestamps(store, 'todos', '1') // { title: '...', done: '...' }
setFieldTimestamps(store, 'todos', '1', { title: stamp }) // replaces the stored stamps
getTombstone(store, 'todos', '2') // { collection, key, deletedAt }
Array.from(tombstoneEntries(store))
gcTombstones(store, olderThanStamp) // removes tombstones older than the stamp
```

The building blocks are also usable without a store: `createHLCClock`, `compareHLC`, `stringifyHLC` and `parseHLC` (`/clock`); `mergeItemFields`, `createFieldTimestamps`, `maxStamp` and `applyConflictPolicy` (`/lww`); `diffText`, `mergeText` and `rebaseTextRange` (`/text`).

## Conflicts

A conflict is a field written with **the same stamp** as the stored one but a different value. `lww.conflictPolicy` decides:

| Policy | Result |
| --- | --- |
| `'lww'` (default) | Keep the stored value and call the `cacheConflict` hook |
| `'local-wins'` | Keep the stored value silently |
| `'remote-wins'` | Take the incoming value silently |
| function | Return `'local'`, `'remote'`, `{ value }` or `undefined` (= `'lww'`) per field |

```ts
createMultiplayerPlugin({
  lww: {
    conflictPolicy: ({ collection, key, conflict }) => {
      if (conflict.field === 'tags')
        return { value: [...new Set([...conflict.localValue, ...conflict.remoteValue])] }
    },
  },
})
```

### cacheConflict

The plugin calls this hook for the conflicts left unresolved by the policy. It is declared by `@rstore/multiplayer`, so it type-checks only when the package is installed.

```ts
hook('cacheConflict', (payload) => {
  console.log(
    payload.collection.name,
    payload.key,
    payload.conflicts, // Array<{ field, localValue, remoteValue, localTimestamp, remoteTimestamp }>
  )
})
```

Typical uses: conflict telemetry, custom resolution workflows, collaboration warnings in the UI.

## Form text merge

With `formTextMerge`, the plugin registers `textFieldMerger` on the [`formFieldMerge`](../plugin/hooks.md#formfieldmerge) hook: a string field changed both locally and remotely is merged when the edits do not overlap. Standalone forms (`createFormObject`) take it as an option:

```ts
import { textFieldMerger } from '@rstore/multiplayer'

const form = createFormObject({
  defaultValues: () => ({ title: '' }),
  fieldMerge: textFieldMerger,
})
```

## Presence

`createPresenceChannel` runs the presence protocol of one room over any text transport. It sends heartbeats, drops peers that stop sending, aggregates connections per user and rebases carets over text changes.

```ts
import { createPresenceChannel } from '@rstore/multiplayer/presence'

const socket = new WebSocket(url)
const channel = createPresenceChannel({
  roomId: 'doc:42',
  user: { id: 'u1', name: 'Ada' },
  transport: {
    send: text => socket.send(text),
    isOpen: () => socket.readyState === WebSocket.OPEN,
  },
})
socket.addEventListener('message', event => channel.receive(event.data))
socket.addEventListener('open', () => channel.handleOpen())

channel.subscribe(({ peers, users, typing }) => render(peers, users, typing))
channel.onUpdate(update => applyRemoteFormState(update))

channel.setTextCursor('body', { start: 4, end: 4, direction: 'none' })
channel.notifyTyping({ collection: 'documents', key: 42, field: 'body' })
channel.clearFocus('body')
channel.dispose() // sends a leave frame and stops the timers
```

| Option | Default | Description |
| --- | --- | --- |
| `roomId` | | Room to join |
| `transport` | | `{ send(text), isOpen?() }` |
| `user` | generated | Partial `{ id, name, color }`; missing parts are generated |
| `heartbeatMs` | `5000` | Presence heartbeat while the transport is open |
| `staleMs` | `15000` | A peer without frames for this long is dropped |
| `typingTimeoutMs` | `3000` | A remote typing indicator expires this long after its last frame |
| `typingThrottleMs` | `1000` | Minimum delay between two typing frames for the same target |
| `onInvalidMessage` | | Called with invalid frames from peers |

- `peers` has one entry per connection (`clientId`); `users` one per user, its most recently seen connection. Two tabs of the same user see each other.
- Typing frames (`multiplayer:typing`) carry a record target (`{ collection, key, field? }`) and never the typed content: the protocol guard rejects any other key.
- `clearFocus(field)` ignores a delayed blur of a field that no longer has the focus.

In Nuxt, use [`@rstore/nuxt-multiplayer`](../../plugins/nuxt-multiplayer.md), which wraps the channel in composables.

## Server

`createMultiplayerServer` relays `multiplayer:*` frames between the members of a room, for any WebSocket runtime:

```ts
import { createMultiplayerServer, createMultiplayerServerHooks, isOriginAllowed } from '@rstore/multiplayer/server'

const hooks = createMultiplayerServerHooks()
hooks.hook('multiplayer.authorize', async ({ peer, roomId, reject, setUserId }) => {
  const user = await getUser(peer)
  if (!user || !canJoin(user, roomId))
    return reject()
  setUserId(user.id)
})

const server = createMultiplayerServer({ hooks, maxRoomSize: 100, maxMessageBytes: 16_384, rateLimit: { capacity: 60, refillPerSecond: 30 } })

// In your WebSocket handler (`peer` needs `id` and `send(text)`):
server.handleMessage(peer, text)
server.handleClose(peer.id)
```

Each frame goes through the size limit, the per-peer rate limit, validation, `multiplayer.authorize` (once per peer and room), identity binding, `multiplayer.filter`, then the broadcast to the other members. Once a connection is bound to a user, the server rewrites the user and client ids of its frames, so a peer cannot speak for someone else. A closing peer leaves its rooms with a `multiplayer:leave` frame. Check the `Origin` header of the upgrade with `isOriginAllowed(origin, host, allowedOrigins)`.

In Nuxt, use [`@rstore/nuxt-multiplayer-server`](../../plugins/nuxt-multiplayer-server.md).
