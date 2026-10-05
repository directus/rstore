# Nuxt Multiplayer <Badge text="New in v0.9" /> <Badge text="Experimental" type="warning" />

`@rstore/nuxt-multiplayer` adds collaborative editing helpers to a Nuxt app: presence, focused fields, text cursors, typing indicators and form synchronization over a WebSocket room. It wraps the framework-agnostic [presence channel](../guide/data/collaboration.md#presence) of `@rstore/multiplayer` in composables and components (built with Nuxt UI).

## Setup

```sh
pnpm i @rstore/nuxt-multiplayer @rstore/multiplayer
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt', '@rstore/nuxt-multiplayer', '@nuxt/ui'],
  runtimeConfig: {
    public: {
      // Default endpoint of useRstoreMultiplayerChannel
      wsEndpoint: '/api/rstore-multiplayer/ws',
    },
  },
})
```

The endpoint must relay `multiplayer:*` frames between the members of a room: use [`@rstore/nuxt-multiplayer-server`](./nuxt-multiplayer-server.md), or `createMultiplayerServer` from `@rstore/multiplayer/server` in your own WebSocket server.

To merge concurrent text edits in forms, also register the [multiplayer plugin](../guide/data/collaboration.md#plugin-setup) in your rstore plugins:

```ts
// app/rstore/plugins/multiplayer.ts
import { createMultiplayerPlugin } from '@rstore/multiplayer'

export default createMultiplayerPlugin()
```

## Composables

### useRstoreMultiplayerChannel

Joins a room. The channel leaves the room when the component (or effect scope) is unmounted.

```ts
const channel = useRstoreMultiplayerChannel<{ title?: string, body?: string }, 'title' | 'body'>({
  roomId: `doc:${props.id}`,
  user: { id: user.id, name: user.name },
})

onMounted(() => channel.joinRoom())
```

| Option | Default | Description |
| --- | --- | --- |
| `roomId` | | Room to join |
| `endpoint` | `runtimeConfig.public.wsEndpoint` | WebSocket URL |
| `user` | generated | Partial `{ id, name, color }` |
| `heartbeatInterval` | `5000` | Presence heartbeat in ms |
| `stalePeerTimeout` | `15000` | A peer without frames for this long is dropped |
| `colors` | built-in palette | Colors for a generated user |

It returns `user`, `clientId`, the refs `peers` (one per connection), `presenceUsers` (one per user), `typingPeers`, `remoteUpdate` and `status`, and the actions `joinRoom`, `leaveRoom`, `sendUpdate`, `setFocusedField`, `setTextCursor`, `rebaseTextCursor`, `clearFocus`, `notifyTyping` and `stopTyping`.

### useRstoreMultiplayerForm

Synchronizes a form object with the room: local changes are broadcast, and remote updates are applied with [`$rebase`](../guide/data/form.md#rebasing-and-conflicts-for-collaboration) while keeping the caret of the focused input in place.

```ts
const form = await store.Document.updateForm(props.id)

const { undoAndSync, redoAndSync } = useRstoreMultiplayerForm({
  form,
  channel,
  trackedFields: ['title', 'body'],
  getBaseValue: () => store.Document.peekFirst(props.id),
  getTextFieldElement: field => (field === 'title' ? titleInput.value : bodyTextarea.value),
})
```

Remote updates are untrusted: prototype-polluting keys are stripped, and fields outside `trackedFields` are dropped when it is set.

### useRstoreMultiplayerField / useRstoreMultiplayerTextField

Announce the focused field (and, for text inputs, the selection) to the room. Both take `{ field, channel }`; `useRstoreMultiplayerField` returns `onFocus`/`onBlur` (for any control, such as a select), `useRstoreMultiplayerTextField` adds `onCursorEvent`. The blur is applied after a tick, so moving the focus between fields never shows the user idle.

```vue
<script setup lang="ts">
const title = useRstoreMultiplayerTextField({ field: 'title', channel })
</script>

<template>
  <input
    v-model="form.title"
    @focus="title.onFocus"
    @blur="title.onBlur"
    @click="title.onCursorEvent"
    @keyup="title.onCursorEvent"
    @select="title.onCursorEvent"
  >
</template>
```

### useRstoreMultiplayerTyping

Typing indicators for one record or field. Frames never carry the typed content.

```ts
const typing = useRstoreMultiplayerTyping(channel, { collection: 'Document', key: props.id, field: 'body' })
// typing.typingUsers: peers typing there
// call typing.onInput() on input events, typing.onBlur() on blur
```

## Components

- `<RstoreMultiplayerPresenceList :user="channel.user" :peers="channel.peers" />`: connected users (one per user) and the field they edit. Props: `user`, `peers`, `emptyLabel?`, `showField?` (default `true`).
- `<RstoreMultiplayerTextCursorOverlay field="body" :peers="channel.peers" :container="wrapper" :target="textarea" />`: remote carets and selections over a text input (client only). Props: `field`, `peers`, `container` (positioned wrapper element), `target` (the input or textarea).

## Collab documents <Badge text="Experimental" type="warning" />

`useRstoreCollabDocument(docId, options?)` opens a [collab document](../guide/data/collaborative-documents.md) on the endpoint of [`@rstore/nuxt-multiplayer-server`](./nuxt-multiplayer-server.md#collab-documents) (with `collab: true`):

```vue
<script setup lang="ts">
const doc = useRstoreCollabDocument(props.docId, { collection: 'docNodes' })
const blocks = await useStore().docNodes.query(q => q.many({ filter: node => node.docId === props.docId && !node.deleted }))
</script>
```

| Option | Default | Description |
| --- | --- | --- |
| `collection` | none | Mirror the document into this collection (pending edits in a cache layer). The store needs `createMultiplayerPlugin({ ot: { collections: [collection] } })` |
| `endpoint` | `runtimeConfig.public.rstoreMultiplayerEndpoint` | WebSocket endpoint |
| `clientId` | random | Stable id of this tab or device |
| `transform` | default mark expansion | Must match the server's `transform` option |

It returns `client` (the OT client, for the ProseMirror binding and undo), `state` (triggers on every change), `loaded`, `status` (`synchronized`, `awaiting`, `awaiting-with-buffer`), `connection` (WebSocket status) and `submit(ops)`. The client reconnects on its own and resumes from its confirmed version; the document closes when the component (or effect scope) is disposed. To keep unconfirmed edits across reloads, use `createCollabClient` with `savePendingState`/`loadPendingState` directly.
