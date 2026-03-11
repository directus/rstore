# Yjs Collaboration Plugin

`@rstore/yjs` adds realtime collaborative sync to rstore using [Yjs](https://yjs.dev/).

::: warning Experimental
`@rstore/yjs` is currently experimental and can still introduce breaking changes.
:::

## Install

::: code-group

```sh [npm]
npm i @rstore/yjs yjs
```

```sh [pnpm]
pnpm add @rstore/yjs yjs
```

:::

You also need a Yjs provider (for example `y-websocket`, `y-webrtc`, or `y-indexeddb`).

## Quick start

```ts
import { createStore } from '@rstore/vue'
import { createYjsPlugin } from '@rstore/yjs'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'

const doc = new Y.Doc()
const provider = new WebsocketProvider('ws://localhost:1234', 'my-room', doc)

const store = await createStore({
  schema: [/* collections */],
  plugins: [
    createYjsPlugin({ doc }),
  ],
})
```

All rstore mutations (`create`, `update`, `delete`) are mirrored to the shared Yjs document, and remote changes are applied back into the rstore cache.

## How data is mapped

- Each collection is stored in a top-level `Y.Map` (`rstore:<collectionName>` by default).
- Each item is stored as a nested `Y.Map` keyed by the item key.
- Primitive field values are stored natively for CRDT merges.
- Objects and arrays are JSON-serialized before storing.

## Plugin options

```ts
createYjsPlugin({
  doc,
  prefix: 'rstore:', // optional
  filterCollection: collection => collection.name !== 'privateNotes', // optional
})
```

## Awareness (presence and cursors)

`@rstore/yjs` also exports `createAwarenessHelper` to manage user presence metadata through the provider awareness channel.

```ts
import { createAwarenessHelper } from '@rstore/yjs'

const awareness = createAwarenessHelper(provider.awareness)
awareness.setUser({ name: 'Alice', color: '#ef4444' })
awareness.setCursor({ collection: 'posts', key: '1', field: 'title' })
```
