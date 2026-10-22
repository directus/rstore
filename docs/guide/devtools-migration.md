# Devtools migration

Portable Devframe devtools introduces clean API break. Remove legacy bridge and component/plugin imports; compatibility aliases are not provided. Store data, connector setup, and Nuxt hydration remain application-owned.

## Vite hosts

Replace `rstoreDevtoolsVite` with `rstoreDevtools` from same `/vite` entry. Replace `route` option with `base`; mount remains relative to application's base.

```ts
import { rstoreDevtools } from '@rstore/devtools/vite'

const plugin = rstoreDevtools({ base: '/internal/inspector/' })
```

Remove `rstoreDevtoolsBuild`. Standard package build supplies `dist/client/`; development Vite host serves packaged assets. No separate Nuxt SPA build/server or port-3300 fallback is required.

## Panels and registration

Replace root `RstoreDevtools` component with `RstoreDevtoolsPanel` from `@rstore/devtools/vue`. Supply explicit `src`; panel does not instrument store or infer host route.

```vue
<script setup lang="ts">
import { RstoreDevtoolsPanel } from '@rstore/devtools/vue'
</script>

<template>
  <RstoreDevtoolsPanel src="/internal/inspector/" />
</template>
```

Snippet belongs in development-only component/bootstrap. See [complete Vue/Vite setup](./devtools.md#vue-and-vite) for production exclusion, browser bootstrap, store plugin, and HMR cleanup.

Remove `RstoreDevtoolsPlugin` and `getRstoreDevtoolsSrc`. Create `createBrowserDevtools` from `/browser`, then use `runtime.plugin({ id, adapter })` during store creation or `runtime.attachStore(store, { id, adapter })` after creation. Vue stores use `createVueDevtoolsAdapter` from `/vue`; neutral Core runtime uses root `createRstoreDevtools`.

Dispose runtime when application/HMR owner ends. Connection and runtime cleanup do not transfer cache lifetime; dispose application-owned cache where appropriate.

## Nuxt

With `@rstore/nuxt`, remove manual bridge/global setup, duplicate runtime plugins, extra Vite host, and separate inspector subprocess. Module automatically registers browser store and captures development SSR requests.

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['@rstore/nuxt'],
  rstore: {
    devtools: { base: '/internal/inspector/', readOnly: true },
  },
})
```

Use `devtools: false` to disable integration. Production disables integration regardless of explicit enabled option. Embedded panel uses `/vue` export and full Nuxt application-base-prefixed mount as `src`; no extra instrumentation is needed.

SSR sessions are read-only, including active requests. Completed records have bounded retention and immutable previews. SSR credential remains private Nitro configuration; browser and MCP use separate credentials.

## Custom clients and automation

Remove `window.parent.__RSTORE_DEVTOOLS__` access and old `RstoreDevtoolsClient`, `RstoreDevtoolsStats`, and `StoreHistoryItem` types. Import DTOs/schemas from `@rstore/devtools/protocol`; connect through official in-page channel or authenticated relay rather than passing live stores/functions.

Every store operation uses full `{ sessionId, storeId, generation }` returned by discovery. Preserve generation; disposal/replacement revokes old target. Read replies contain detached previews with revisions and truncation, not raw refs, private cache layers, or callable module objects.

Actions require plain JSON, `commandId`, and `issuedAt`. Preserve ID/payload for deliberate retry within command window; handle `accepted`, `completed`, and `UNKNOWN_OUTCOME` separately. Never retry uncertain writes automatically.

Use standalone `rstore-devtools dev` with explicitly connected browser/Node producers. For MCP, configure separate HTTP bearer or use `rstore-devtools mcp --connect <relay-base-url>` with explicit viewer credential. See [MCP setup](./devtools.md#mcp). Application factory loading, unauthenticated HTTP MCP, and static report command are unsupported.
