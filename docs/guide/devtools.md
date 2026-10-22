# Devtools

`@rstore/devtools` inspects Core and Vue stores through one portable runtime. Devframe connects embedded panels, browser tabs, Node producers, SSR records, and MCP clients.

Inspector includes Collections, Cache, History, Subscriptions, Modules, and Plugins. Reads return bounded, detached previews. Opening a view never fetches collection data from backend or invokes module functions.

Host tooling requires Node 26 or newer. Integration targets pinned Devframe `1.2.2` and matching `@devframes/agentic` `1.2.2`. Vue is optional for neutral runtime and Node imports; built inspector includes its own Vue frontend.

::: code-group

```sh [npm]
npm i @rstore/devtools
```

```sh [pnpm]
pnpm add @rstore/devtools
```

:::

Upgrading existing integration? Follow [Devtools migration](./devtools-migration.md).

## Vue and Vite

### Host inspector and relay

Vite plugin serves inspector assets and authenticated relay during development. Default mount is `/__rstore/`, relative to Vite application base. Production builds and preview servers receive no devtools routes.

```ts [vite.config.ts]
import { rstoreDevtools } from '@rstore/devtools/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue(), rstoreDevtools()],
})
```

### Register application store

Create browser runtime before store construction. Its plugin captures operations from initialization onward; Vue adapter unwraps refs and owns reactive observation while Modules view is watched.

```ts [src/rstore.ts]
import { createStore, defineCollection } from '@rstore/vue'

async function createDevelopmentRuntime() {
  const [{ createBrowserDevtools }, { createVueDevtoolsAdapter }] = await Promise.all([
    import('@rstore/devtools/browser'),
    import('@rstore/devtools/vue'),
  ])
  const response = await fetch(`${import.meta.env.BASE_URL}__rstore/bootstrap.json`, {
    credentials: 'same-origin',
  })
  if (!response.ok)
    throw new Error(`Devtools bootstrap failed: ${response.status}`)
  const bootstrap = await response.json()
  if (bootstrap.protocolVersion !== 1)
    throw new Error('Devtools protocol mismatch')
  return {
    runtime: createBrowserDevtools({
      baseURL: bootstrap.baseURL,
      authToken: bootstrap.authToken,
    }),
    adapter: createVueDevtoolsAdapter(),
  }
}

const development = import.meta.env.DEV ? await createDevelopmentRuntime() : undefined

export const store = await createStore({
  schema: [defineCollection({ name: 'todos' })],
  plugins: development
    ? [development.runtime.plugin({ id: 'main', adapter: development.adapter })]
    : [],
})

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    development?.runtime.dispose()
    store.$cache.dispose()
  })
}
```

Schema demonstrates registration. Add collection hooks or connector plugin for backend CRUD; devtools uses same Core mutation pipeline as application.

### Render panel

Panel renders iframe; application owns instrumentation. Keep devtools imports inside development branch to exclude instrumentation and panel code from production.

```vue [src/App.vue]
<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const panelSrc = `${import.meta.env.BASE_URL}__rstore/`
const Panel = import.meta.env.DEV
  ? defineAsyncComponent(async () => (await import('@rstore/devtools/vue')).RstoreDevtoolsPanel)
  : undefined
</script>

<template>
  <div v-if="Panel" style="height: 480px">
    <component :is="Panel" :src="panelSrc" />
  </div>
</template>
```

Use `visible` to unmount hidden panel and release viewer leases. Explicit `src` addresses inspector assets; runtime `baseURL` addresses relay. They can use different origins.

### Custom application base or mount

```ts [vite.config.ts]
import { rstoreDevtools } from '@rstore/devtools/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/app/',
  plugins: [vue(), rstoreDevtools({ base: '/internal/inspector/' })],
})
```

Inspector is `/app/internal/inspector/`; browser bootstrap is `/app/internal/inspector/bootstrap.json`. Replace `__rstore/` in bootstrap and panel snippets with `internal/inspector/`.

## Browser-only inspection

Replace browser bootstrap in Vue example with following development factory. Store registration, panel rendering, and HMR cleanup stay same:

```ts
async function createDevelopmentRuntime() {
  const [{ createBrowserDevtools }, { createVueDevtoolsAdapter }] = await Promise.all([
    import('@rstore/devtools/browser'),
    import('@rstore/devtools/vue'),
  ])
  return {
    runtime: createBrowserDevtools({ relay: false }),
    adapter: createVueDevtoolsAdapter(),
  }
}
```

Serve packaged inspector assets with development Vite plugin or development asset host, then render panel in producer page. Embedded panel discovers ancestor through Devframe channel. Default accepted origin is page origin. For external panel assets, pass exact HTTP origins in `createBrowserDevtools({ relay: false, allowedOrigins: [...] })` and configure corresponding viewer trust. Wildcards are rejected.

Browser-only runtime does not publish session to standalone tabs or MCP relay. Embedded channel still supports shared read and action contracts.

## Core runtime

Root entry imports neither Vue nor host code. `createStoreCore` requires application-provided `Cache`; devtools does not provide or replace cache engine. Custom cache must implement public `inspect()` for Cache view. Other supported views remain available without cache inspection.

```ts [src/create-inspected-store.ts]
import type { Cache } from '@rstore/shared'
import { createStoreCore, defineCollection } from '@rstore/core'
import { createRstoreDevtools } from '@rstore/devtools'
import { createHooks } from '@rstore/shared'

/** Call with application's Cache implementation; caller owns its lifetime. */
export async function createInspectedStore(cache: Cache) {
  const runtime = createRstoreDevtools({ kind: 'node', label: 'Application' })
  try {
    const store = await createStoreCore({
      schema: [defineCollection({ name: 'todos' })],
      cache,
      hooks: createHooks(),
      plugins: [runtime.plugin({ id: 'main' })],
    })
    return {
      store,
      runtime,
      dispose() {
        runtime.dispose()
        cache.dispose()
      },
    }
  }
  catch (error) {
    runtime.dispose()
    throw error
  }
}
```

For existing store, call `runtime.attachStore(store, { id: 'main' })` instead of installing plugin. Returned registration has `target` and `dispose()`. Attachment captures future operations only. Duplicate live IDs and double attachment to same runtime are rejected. Dispose old registration before reusing ID; replacement receives new generation.

Set `readOnly: true` on either registration method to reject every devtools action, including history clearing. Runtime cleanup releases devtools resources; application retains store/cache ownership.

### Direct reads and actions

These calls also back browser, relay, and MCP handlers. Example attaches concrete Vue store to neutral runtime; same API accepts Core store.

```ts
import { createRstoreDevtools } from '@rstore/devtools'
import { createStore, defineCollection } from '@rstore/vue'

const store = await createStore({
  schema: [defineCollection({ name: 'todos' })],
  plugins: [],
})
const runtime = createRstoreDevtools()
const registration = runtime.attachStore(store, { id: 'main' })

try {
  await runtime.execute({
    action: 'write-cache-item',
    target: registration.target,
    commandId: crypto.randomUUID(),
    issuedAt: Date.now(),
    collection: 'todos',
    item: { id: 'first', title: 'Inspect cache' },
  })
  console.log(runtime.read({
    method: 'rstore:get-cache',
    target: registration.target,
    collection: 'todos',
    view: 'effective',
    page: { offset: 0, limit: 100 },
  }))
}
finally {
  runtime.dispose()
  store.$cache.dispose()
}
```

## Nuxt

`@rstore/nuxt` automatically registers browser store and captures SSR requests during development. It hosts inspector/relay and adds rstore tab to Nuxt DevTools. No extra store plugin, Vite plugin, or inspector process is needed.

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['@rstore/nuxt'],
  rstore: {
    devtools: { base: '/__rstore/', readOnly: false },
  },
})
```

Use `rstore: { devtools: false }` to disable browser instrumentation, SSR capture, and host. Production always disables integration, even with `devtools: true`. Mount includes Nuxt `app.baseURL`.

To embed panel alongside automatic integration, load `/vue` only during development and use full inspector mount as `src`:

```vue [app/app.vue]
<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const config = useRuntimeConfig()
const panelSrc = `${config.app.baseURL}__rstore/`
const Panel = import.meta.dev
  ? defineAsyncComponent(async () => (await import('@rstore/devtools/vue')).RstoreDevtoolsPanel)
  : undefined
</script>

<template>
  <ClientOnly>
    <div v-if="Panel" style="height: 480px">
      <component :is="Panel" :src="panelSrc" />
    </div>
  </ClientOnly>
</template>
```

Change `__rstore/` to match custom `rstore.devtools.base`. Automatic store already has instrumentation; do not add another runtime.

Nuxt without `@rstore/nuxt` can use Vite host and explicit browser registration from Vue example. Keep store creation in client bootstrap and derive mount from Nuxt application base. That setup does not automatically capture SSR requests.

### SSR inspection

Each admitted development request receives separate session and read-only store registration. Active sessions stay read-only; finished sessions become immutable detached records with `completed`, `error`, or `aborted` status.

Active discovery includes safe request method, path without query/fragment, start timestamp, and `active` status. Terminal records add completion timestamp, duration, outcome status, and bounded error preview when available. Failures before store registration still produce request metadata with empty store list; they cannot expose fabricated store data or writable target.

Failure preview reads data properties for name, message, and valid HTTP status. Capture does not traverse error `cause`, request headers/cookies, or application error payload fields.

Defaults retain latest 50 completed requests for five minutes, bounded to 512 KiB per snapshot and 32 MiB aggregate. At most 50 concurrent requests are inspectable; additional requests continue normally without capture. History, previews, and snapshots report truncation. Worker owns one relay connection and bounded detached records during relay outages.

SSR producer credential lives only in private Nitro runtime configuration. Browser bootstrap receives separate browser credential. Neither browser payload nor public runtime config receives SSR token. HTTP MCP bearer cannot register private SSR producer.

## Standalone and Node producers

CLI starts inspector and relay on loopback port 9999. It receives explicitly connected producers; it never imports application store factory. Generate credentials once per development session and pass them to corresponding processes.

```sh
export RSTORE_DEVTOOLS_NODE_AUTH_TOKEN="$(node -e 'console.log(crypto.randomUUID())')"
pnpm exec rstore-devtools dev --port 9999 --base /inspect/ --open
```

`--open` opens trusted viewer using official one-use OTP in URL fragment. Inspector consumes code and removes fragment from URL/history; role credentials never enter URLs. Subsequent viewer authority remains in memory. For another browser tab or remote viewer, configure separate viewer credential and enter it in Connection form. Do not use Node producer token as viewer credential.

Run script below in another terminal with same Node producer token. It creates its own store; relay receives detached data.

```ts [scripts/inspect-store.ts]
import { createRstoreDevtools } from '@rstore/devtools'
import { connectRstoreDevtools } from '@rstore/devtools/node'
import { createVueDevtoolsAdapter } from '@rstore/devtools/vue'
import { createStore, defineCollection } from '@rstore/vue'

const authToken = process.env.RSTORE_DEVTOOLS_NODE_AUTH_TOKEN
if (!authToken)
  throw new Error('RSTORE_DEVTOOLS_NODE_AUTH_TOKEN required')

const runtime = createRstoreDevtools({ kind: 'node', label: 'Local application' })
const store = await createStore({
  schema: [defineCollection({ name: 'todos' })],
  plugins: [runtime.plugin({ id: 'main', adapter: createVueDevtoolsAdapter() })],
})
const connection = connectRstoreDevtools(runtime, {
  baseURL: 'http://127.0.0.1:9999/inspect/',
  authToken,
})

function dispose() {
  connection.dispose()
  runtime.dispose()
  store.$cache.dispose()
}
process.once('SIGINT', dispose)
process.once('SIGTERM', dispose)

try {
  await connection.ready
  console.log('Store published')
}
catch (error) {
  dispose()
  throw error
}
```

For neutral Core application, pass its runtime to same `connectRstoreDevtools`; `/vue` is unnecessary. Programmatic hosts can use `createRstoreDevframe` and `createRstoreDevframeHost` from `/node`. Host wrapper preserves role authentication and disconnect ownership; use it when mounting definition.

Closing producer connection leaves runtime/store caller-owned. Reconnect republishes registrations; it never retries data actions. Restart/reload creates new session; replacing registration invalidates old generation.

### Viewer connections and trust

Embedded panel first uses ancestor's in-page channel. Hosted inspector in another tab connects through relay with trusted viewer authority: CLI `--open` uses one-use OTP, or Connection form accepts separate explicit viewer token. Credentials stay in memory rather than URL or browser storage. Independent viewers keep independent target selections.

External-origin viewers use Devframe viewer-origin registration and interactive trust. Vite `allowedOrigins` accepts explicit origins for known viewer hosts; it does not grant producer authority. Separate `viewer`, `browser`, `node`, and `ssr` role tokens, and HTTP MCP bearer, must be distinct. Token reuse is rejected.

## MCP

### HTTP

Set separate `DEVFRAME_MCP_AUTH_TOKEN` in host process to enable HTTP MCP. Without token, HTTP MCP stays disabled. Vite/Nuxt host prints one setup hint; CLI prints inspector and MCP URLs to stderr.

```sh
export DEVFRAME_MCP_AUTH_TOKEN="$(node -e 'console.log(crypto.randomUUID())')"
pnpm exec rstore-devtools dev --port 9999 --base /inspect/ --mcp
```

Configure client with printed endpoint, `Authorization: Bearer <DEVFRAME_MCP_AUTH_TOKEN>`, and `Origin` matching relay's loopback origin. Devframe `1.2.2` rejects HTTP MCP requests without accepted `Origin`, including authenticated native clients; standard MCP SDK does not add it automatically. Use host discovery/startup endpoint instead of assuming path under custom base. `--no-auth` is unsupported.

For MCP TypeScript SDK, supply both headers through `requestInit`:

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const endpoint = new URL(process.env.RSTORE_DEVTOOLS_MCP_URL!) // Printed HTTP MCP endpoint.
const client = new Client({ name: 'rstore-inspector', version: '1.0.0' })
await client.connect(new StreamableHTTPClientTransport(endpoint, {
  requestInit: {
    headers: {
      Authorization: `Bearer ${process.env.DEVFRAME_MCP_AUTH_TOKEN!}`,
      Origin: endpoint.origin,
    },
  },
}))
try {
  console.log((await client.listTools()).tools)
}
finally {
  await client.close()
}
```

MCP exposes public reads and explicit actions; producer registration and arbitrary module invocation are absent. Tool IDs replace `:` with `_`: `rstore_list-sessions`, `rstore_get-cache`, `rstore_create-item`. Devframe `1.2.2` arguments place request envelope under `arg0`:

```json
{
  "name": "rstore_list-sessions",
  "arguments": { "arg0": {} }
}
```

Discover session/store summaries first. Actions use complete returned `{ sessionId, storeId, generation }`; no default writable target exists.

### Stdio bridge

Stdio forwards to existing relay. Configure distinct viewer token in relay host process:

```sh
export RSTORE_DEVTOOLS_VIEWER_AUTH_TOKEN="$(node -e 'console.log(crypto.randomUUID())')"
pnpm exec rstore-devtools dev --port 9999 --base /inspect/
```

Pass same viewer token to MCP client's child process. Configuration below assumes installed binary on `PATH`; replace placeholder in client's private configuration.

```json
{
  "mcpServers": {
    "rstore": {
      "command": "rstore-devtools",
      "args": ["mcp", "--connect", "http://127.0.0.1:9999/inspect/"],
      "env": {
        "RSTORE_DEVTOOLS_VIEWER_AUTH_TOKEN": "<viewer token from relay host>"
      }
    }
  }
}
```

No HTTP MCP token is required for stdio. `mcp` requires explicit `--connect` and viewer token; it does not create empty local registry. Stdout carries protocol only, diagnostics use stderr, and shutdown closes owned relay connection.

## Actions and bounded data

Cache write/delete/clear affects local cache through public APIs. Collections create/update/delete calls normal Core connector hooks, including validation, optimistic layers, errors, and offline queueing. Neither path resumes application-owned paused cache.

`completed` means operation completed through normal application pipeline. `accepted` means queued cache/backend work remains pending or completion cannot be established. Custom caches without optional `Cache.receipts` conservatively return `accepted`; incidental return values from legacy `void` methods are ignored. Vue cache provides receipts for individual writes, deletes, and resets. Offline mutations include `queued: true`. Transport loss can return `UNKNOWN_OUTCOME`: inspect application/history before deciding whether to retry. Inspector never retries writes automatically.

Each action requires `commandId` and `issuedAt`. Same ID/payload shares outcome within five-minute window and registration generation. Different payload with same ID returns `COMMAND_CONFLICT`; expired command returns `COMMAND_EXPIRED`. Pending/unexpired records are not evicted to admit more than 1,000 commands per registration. Deduplication does not guarantee durable exactly-once across restart.

Read-only, stale, missing, and unsupported targets fail at runtime boundary even with crafted client action. Previews are display DTOs, not callable functions or action input; actions accept bounded plain JSON.

- Pages default to 100 rows, maximum 500.
- Cache scans at most 10,000 candidates, filters before paging, and reports incomplete scan/unknown matching total.
- History retains newest 1,000 entries or 4 MiB per registration.
- Previews are bounded to 32 KiB, depth 10, 1,000 entries, and 8 KiB per string.
- Tab replies and completed SSR snapshots are bounded to 512 KiB.
- Action envelope is bounded to 32 KiB, depth 10, and 1,000 entries.

Static reports, production capture, arbitrary module calls, executable inspection filters, and browser extension remain outside scope.
