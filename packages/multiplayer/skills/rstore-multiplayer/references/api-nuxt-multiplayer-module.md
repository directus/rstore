| name | description |
| --- | --- |
| `api-nuxt-multiplayer-module` | Reference for the `@rstore/nuxt-multiplayer` Nuxt module |

# @rstore/nuxt-multiplayer module

Nuxt module adding presence, cursors, typing and form sync composables/components.

## Surface

`modules: ['@rstore/nuxt', '@rstore/nuxt-multiplayer', '@nuxt/ui']` with `runtimeConfig.public.wsEndpoint`.

## Syntax

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

## Behavior

- Wraps `createPresenceChannel` from `@rstore/multiplayer/presence` in composables.
- Components are built with Nuxt UI.
- Composables keep their pre-0.9 names.

## Requirements

- Install `@rstore/nuxt-multiplayer` and `@rstore/multiplayer`.
- The endpoint must relay `multiplayer:*` frames: `@rstore/nuxt-multiplayer-server` or `createMultiplayerServer`.
- For form text merge, also register `createMultiplayerPlugin()` in an rstore plugins file (for example `app/rstore/plugins/multiplayer.ts`).

## Pitfalls

1. Deep imports of `runtime/utils/*` broke in v0.9: use `parseMultiplayerMessage` from `@rstore/multiplayer/protocol` and cursor helpers from `@rstore/multiplayer/presence`.
