# @rstore/nuxt-multiplayer

Nuxt composables and components for collaborative editing with [rstore](https://rstore.akryum.dev): presence, focused fields, text cursors, typing indicators and form synchronization over a WebSocket room. Experimental.

```sh
pnpm i @rstore/nuxt-multiplayer @rstore/multiplayer
```

```ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt', '@rstore/nuxt-multiplayer', '@nuxt/ui'],
})
```

- `useRstoreMultiplayerChannel({ roomId })`: join a room (peers, presence, remote updates)
- `useRstoreMultiplayerForm({ form, channel, ... })`: sync a form object with `$rebase`
- `useRstoreMultiplayerField` / `useRstoreMultiplayerTextField`: announce focus and selection
- `useRstoreMultiplayerTyping(channel, target)`: typing indicators without content
- `<RstoreMultiplayerPresenceList>`, `<RstoreMultiplayerTextCursorOverlay>`
- `useRstoreCollabDocument(docId, { collection })`: open a [collab document](https://rstore.akryum.dev/guide/data/collaborative-documents) (experimental)

The logic lives in [`@rstore/multiplayer/presence`](https://rstore.akryum.dev/guide/data/collaboration#presence). Pair it with [`@rstore/nuxt-multiplayer-server`](https://rstore.akryum.dev/plugins/nuxt-multiplayer-server) or any server relaying `multiplayer:*` frames.

Documentation: [Nuxt Multiplayer](https://rstore.akryum.dev/plugins/nuxt-multiplayer).

## License

MIT
