# @rstore/yjs

**EXPERIMENTAL**: This package is in early development and may have breaking changes. Use with caution.

Rstore plugin for **realtime collaboration** using [Yjs](https://yjs.dev/).

This plugin syncs rstore collection data through a shared Yjs document, enabling multiple users to collaboratively edit data in real time with automatic conflict resolution powered by Yjs CRDTs.

## Installation

```bash
pnpm add @rstore/yjs yjs
```

You will also need a Yjs **provider** to connect peers (e.g. `y-websocket`, `y-webrtc`, `y-indexeddb`).

## Quick Start

```ts
import { createYjsPlugin } from '@rstore/yjs'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'

// 1. Create a Yjs document and connect it to a provider
const ydoc = new Y.Doc()
const provider = new WebsocketProvider('ws://localhost:1234', 'my-room', ydoc)

// 2. Create the rstore plugin
const yjsPlugin = createYjsPlugin({ doc: ydoc })

// 3. Pass it to your rstore setup
const store = await createStore({
  plugins: [yjsPlugin],
  // ...
})
```

All mutations made through rstore (`create`, `update`, `delete`) are automatically pushed to the Yjs document and broadcast to connected peers. Remote changes are applied to the rstore cache in real time.

## How It Works

- Each rstore **collection** is mapped to a top-level `Y.Map` in the Yjs document, keyed as `rstore:<collectionName>`.
- Each **item** in a collection is stored as a nested `Y.Map`, keyed by the item's primary key.
- **Primitive fields** (string, number, boolean) are stored natively in Yjs for efficient field-level CRDT merging.
- **Objects and arrays** are JSON-serialized to avoid nested CRDT complexity.
- The plugin uses Yjs transactions to batch local mutations and `observeDeep` to react to remote changes.
- Re-entrant loops are prevented: local mutations don't trigger the remote observer, and remote changes don't trigger mutation hooks.

## Options

```ts
interface YjsPluginOptions {
  /** The Yjs document to sync through. */
  doc: Y.Doc

  /** Filter which collections are synced. Default: all. */
  filterCollection?: (collection: ResolvedCollection) => boolean

  /** Prefix for Y.Map names. Default: 'rstore:' */
  prefix?: string
}
```

### Filtering Collections

```ts
createYjsPlugin({
  doc: ydoc,
  filterCollection: collection => collection.name !== 'privateNotes',
})
```

## Awareness (User Presence)

The package also exports an `createAwarenessHelper` for managing user presence:

```ts
import { createAwarenessHelper } from '@rstore/yjs'

const awareness = createAwarenessHelper(provider.awareness)

// Set your user info
awareness.setUser({ name: 'Alice', color: '#ff0000' })

// Set cursor position
awareness.setCursor({ collection: 'posts', key: '1', field: 'title' })

// Listen for presence changes
const unsubscribe = awareness.onChange(({ added, updated, removed }) => {
  console.log('Peers changed:', { added, updated, removed })
})

// Get all connected users
const states = awareness.getStates()
```

## Usage with Providers

### y-websocket

```ts
import { WebsocketProvider } from 'y-websocket'

const provider = new WebsocketProvider('ws://localhost:1234', 'room-name', ydoc)
```

### y-webrtc

```ts
import { WebrtcProvider } from 'y-webrtc'

const provider = new WebrtcProvider('room-name', ydoc)
```

### y-indexeddb (offline persistence)

```ts
import { IndexeddbPersistence } from 'y-indexeddb'

const persistence = new IndexeddbPersistence('db-name', ydoc)
```

These providers can be combined — for example, use `y-websocket` for realtime sync and `y-indexeddb` for offline persistence.

## License

MIT
