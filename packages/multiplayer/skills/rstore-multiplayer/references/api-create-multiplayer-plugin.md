| name | description |
| --- | --- |
| `api-create-multiplayer-plugin` | Reference for `createMultiplayerPlugin(options?)` |

# createMultiplayerPlugin

Store plugin adding field-level LWW, tombstones, conflict policies and form text merge.

## Surface

`createMultiplayerPlugin({ lww?, tombstoneGc?, formTextMerge? })` from `@rstore/multiplayer`.

## Syntax

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

// Nuxt: app/rstore/plugins/multiplayer.ts
export default createMultiplayerPlugin()
```

## Behavior

- Merges stamped writes (`metadata.fieldTimestamps`) field by field: newest stamp wins per field.
- Records a tombstone for stamped deletes (`metadata.deletedAt`) and drops later writes older than it.
- Calls the `cacheConflict` hook for same-stamp/different-value conflicts left unresolved by the policy.
- Registers `textFieldMerger` on the `formFieldMerge` hook (`formTextMerge`, default `true`).
- Runs a periodic tombstone GC on clients (`tombstoneGc`); the timer stops when the cache is disposed.
- Stores stamps and tombstones as item metadata (`multiplayer:fields`, `multiplayer:tombstone`): serialized with SSR state and persisted by the offline plugin.

## Requirements

- Install once per store.
- Nuxt + Drizzle with `ws` already installs it (`lww: true, formTextMerge: false`); see `ws.lww` in the `rstore-nuxt-drizzle` skill.

## Pitfalls

1. Without it, stamped writes overwrite the cached row, deletes leave no tombstone, and development warns about unhandled `fieldTimestamps`/`deletedAt` metadata.
2. Registering it a second time (for example next to the Nuxt + Drizzle default) is not supported.
