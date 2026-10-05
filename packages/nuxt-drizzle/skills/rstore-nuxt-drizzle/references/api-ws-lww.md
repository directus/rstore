| name | description |
| --- | --- |
| `api-ws-lww` | Reference for `rstoreDrizzle.ws.lww` |

# rstoreDrizzle.ws.lww

Controls the multiplayer LWW plugin installed with websocket realtime.

## Surface

`rstoreDrizzle.ws.lww: boolean` (default `true`).

## Syntax

```ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt-drizzle'],
  rstoreDrizzle: {
    ws: {
      lww: false,
    },
  },
})
```

## Behavior

- `true`: installs `createMultiplayerPlugin({ lww: true, formTextMerge: false })` from `@rstore/multiplayer`, merging stamped frames field by field and keeping tombstones.
- `false`: stamped frames overwrite cached rows and deletes leave no tombstone.

## Requirements

- Only meaningful with `ws` enabled.

## Pitfalls

1. Do not register your own multiplayer plugin in addition to the default one; set `lww: false` first (for example to enable form text merge).
2. With `false` and no own plugin, a delayed frame can overwrite a newer value or resurrect a deleted row.
