| name | description |
| --- | --- |
| `api-devtools-route` | Portable development inspector and relay setup |

# Devtools Route (`/__rstore/`)

## Surface

Module-managed development inspector, Devframe relay, and Nuxt DevTools custom tab.

## Syntax

```ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt'],
  rstore: {
    devtools: {
      base: '/__rstore',
      readOnly: false,
    },
  },
})
```

## Behavior

- Enabled by default in development; `rstore.devtools: false` disables hosting and capture.
- Production excludes devtools even when `rstore.devtools` is explicitly enabled.
- Inspector mounts relative to Nuxt application base. Default application base uses `/__rstore/`.
- Shared host serves built Vue/Vite inspector assets and official Devframe discovery/RPC transport. Workspace development requires a devtools package build; missing assets report build command.
- Nuxt uses official WebSocket sidecar because Nitro owns frontend upgrades. Discovery remains at inspector base and advertises allocated transport port; no manual port configuration or proxy needed.
- Browser store registers as `default` through portable runtime and Vue adapter. Explicit `readOnly` rejects crafted actions as well as disabling UI writes.
- SSR captures isolated, bounded, read-only request records. Private SSR producer credentials never enter public runtime config or browser payload.
- HTTP MCP requires `DEVFRAME_MCP_AUTH_TOKEN`; external viewer origins require explicit trust. Credentials never belong in URL query strings.

## Requirements

- Devtools integration is module-managed; do not start another inspector server or mount duplicate relay routes.
- Standalone inspector tab uses same configured base; embedded custom tab preserves its own target selection.

## Pitfalls

1. Conflicting manual proxy/route setup can break inspector or discovery endpoints.
2. `base` names inspector path, while browser producer connection uses relay base URL. Do not substitute asset URLs for discovery URLs.
3. No production/static report integration or application store-factory loading is provided by this development route.
