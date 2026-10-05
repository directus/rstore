# @rstore/multiplayer

Framework-agnostic collaboration building blocks for [rstore](https://rstore.akryum.dev). Experimental.

```sh
pnpm i @rstore/multiplayer
```

| Entry | Content |
| --- | --- |
| `@rstore/multiplayer` | `createMultiplayerPlugin()`: field-level last-writer-wins merge of stamped cache writes, tombstones and their GC, conflict policies, form text merge |
| `@rstore/multiplayer/clock` | Hybrid Logical Clock |
| `@rstore/multiplayer/lww` | Field merge, tombstones, conflict policies |
| `@rstore/multiplayer/text` | Text diff, three-way merge, cursor rebasing |
| `@rstore/multiplayer/presence` | `createPresenceChannel()`: peers, focused fields, cursors, typing indicators over any text transport |
| `@rstore/multiplayer/protocol` | Wire frame types, guards and sanitization |
| `@rstore/multiplayer/server` | `createMultiplayerServer()`: transport-agnostic rooms with authorization, identity binding, rate limits and origin checks; `createCollabServer()`: collab document sequencer and op log stores (experimental) |
| `@rstore/multiplayer/ot` | Collab documents: rich-text OT on block rows, client, per-user undo, IME guard (experimental) |
| `@rstore/multiplayer/prosemirror` | ProseMirror binding of collab documents, `prosemirror-*` as optional peers (experimental) |

The package depends only on `@rstore/shared`: no Vue, no Nuxt, no Node APIs.

```ts
import { createMultiplayerPlugin } from '@rstore/multiplayer'
import { createStore } from '@rstore/vue'

const store = await createStore({
  schema,
  plugins: [remotePlugin, createMultiplayerPlugin()],
})

// Realtime frames carry per-field stamps as write metadata
store.$cache.writeItem({ collection, key, item, metadata: { fieldTimestamps } })
```

Documentation: [Collaboration guide](https://rstore.akryum.dev/guide/data/collaboration), [Collaborative documents](https://rstore.akryum.dev/guide/data/collaborative-documents).

Nuxt adapters: [`@rstore/nuxt-multiplayer`](https://rstore.akryum.dev/plugins/nuxt-multiplayer) (composables and components) and [`@rstore/nuxt-multiplayer-server`](https://rstore.akryum.dev/plugins/nuxt-multiplayer-server) (Nitro WebSocket endpoint).

## License

MIT
