<script setup lang="ts">
import { VPFeatures } from 'vitepress/theme'
</script>

# Nuxt + Drizzle

<div class="py-12">
  <VPFeatures
    :features="[
      {
        icon: '🪄',
        title: 'Auto-generated Collections',
        details: `Collections are automatically generated from your Drizzle schema (including relations), alongside the necessary API and plugin.`,
      },
      {
        icon: '📚',
        title: 'Type Safety',
        details: 'All collections are fully typed using your Drizzle schema.',
      },
      {
        icon: '⚡',
        title: 'Realtime',
        details: 'Built-in support for realtime updates using WebSockets and Pub/Sub.',
      },
      {
        icon: '📡',
        title: 'Offline Mode',
        details: 'Built-in offline mode to allow your app to work seamlessly offline.',
      },
      {
        icon: '🔒',
        title: 'Security',
        details: 'Easily restrict the tables exposed through the API with the `allowTables` function.',
      },
      {
        icon: '🔌',
        title: 'Hooks',
        details: 'Run code server-side before or after certain actions on the tables using hooks.',
      },
    ]"
    class="px-0! [&_h2]:m-0! [&_.item]:w-1/2!"
  />
</div>

[Online Demo](https://pokemon.akryum.dev) ([source code](https://github.com/Akryum/rstore-pokemon))

[Codesandbox](https://codesandbox.io/p/devbox/wonderful-sun-s4cgl6)

In case you are using [Drizzle](https://orm.drizzle.team), you can install the `@rstore/nuxt-drizzle` module instead of `@rstore/nuxt` to automatically generate the collections and plugins from your drizzle schema.

::: info Prerequisites
Before enabling this module, make sure your app already has:

- a valid `drizzle.config.ts`
- an exported Drizzle schema file
- a `useDrizzle()` server utility (or custom import configured with `rstoreDrizzle.drizzleImport`)
:::

```sh
npm i @rstore/nuxt-drizzle drizzle-orm drizzle-kit
```

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: [
    '@rstore/nuxt-drizzle',
  ],
})
```

Install a DB driver and [setup drizzle with a schema](https://orm.drizzle.team/docs/sql-schema-declaration).

::: warning Important Notice

By default the module will attempt to import `useDrizzle` from `~~/server/utils/drizzle` that should return a drizzle instance.

Example:

```ts
// server/utils/drizzle.ts

import { drizzle } from 'drizzle-orm/libsql'

let drizzleInstance: ReturnType<typeof drizzle> | null = null

export function useDrizzle() {
  drizzleInstance ??= drizzle({
    connection: { url: useRuntimeConfig().dbUrl },
    casing: 'snake_case',
  })
  return drizzleInstance
}
```

You can customize this in the `rstoreDrizzle.drizzleImport` option in the Nuxt config.

```ts
export default defineNuxtConfig({
  modules: [
    '@rstore/nuxt-drizzle',
  ],
  rstoreDrizzle: {
    drizzleImport: {
      name: 'useDb',
      from: '~~/server/useDb',
    },
  },
})
```

:::

The module will automatically:
- load the drizzle schema from the `drizzle.config.ts` file (configurable with the `rstoreDrizzle.drizzleConfigPath` option in the Nuxt config),
- generate the collections from the schema for each table with the relations,
- generate a REST API under the `/api/rstore` path to handle the CRUD operations,
- generate a plugin to handle the queries and mutations,
- generate all the necessary types for the collections and the API.

Example drizzle schema:

```ts
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const todos = sqliteTable('todos', {
  id: integer().primaryKey({ autoIncrement: true }),
  title: text().notNull(),
  completed: integer().notNull().$defaultFn(() => 0),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }),
})
```

Example drizzle config:

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './server/database/schema.ts',
  out: './server/database/migrations',
  casing: 'snake_case',
})
```

You can already use the store in your components without any additional configuration:

```vue
<script setup>
const store = useStore()

const { data: todos } = await store.todos.query(q => q.many())
</script>

<template>
  <pre>{{ todos }}</pre>
</template>
```

::: tip Collection Names
Collection names are inferred from exported variable names in your Drizzle schema, **not** table names.
:::

::: tip
You can use [Nitro middleware](https://nitro.build/guide/routing#middleware) to add API authentication, for example in `server/middleware/auth.ts`.
:::

## Filtering

You can use the `where` option of any [query](../guide/data/query.md) to filter the results using drizzle's operators such as `eq`, `gt`, `lt`, etc. (which are auto-imported). Since rstore is local-first, it will also compute the where clause on the client side.

The supported operators are defined [here](https://github.com/Akryum/rstore/blob/main/packages/nuxt-drizzle/src/runtime/utils/types.ts#L5) ([drizzle docs](https://orm.drizzle.team/docs/operators)).

```vue
<script lang="ts" setup>
const store = useStore()

const email = ref('')

const { data: users } = await store.users.query(q => q.many({
  where: email.value ? eq('email', email.value) : undefined,
}))
</script>
```

::: info
Please note that only simple filters are supported - you can't do joins or subqueries inside `where`.
:::

## Relations

You can use the `include` option to include related collections in the query. [Learn more here](../guide/schema/relations.md).

```vue
<script lang="ts" setup>
const store = useStore()

const { data: users } = await store.users.query(q => q.many({
  include: {
    posts: true,
  },
}))
</script>
```

You can also pass relation-level query options (`where`, `orderBy`, `columns`, `limit`) and nested includes:

```vue
<script lang="ts" setup>
const store = useStore()

const { data: users } = await store.users.query(q => q.many({
  include: {
    posts: {
      where: eq('published', true),
      orderBy: ['createdAt.desc'],
      limit: 5,
      columns: {
        id: true,
        title: true,
      },
      include: {
        comments: {
          where: eq('approved', true),
          limit: 3,
        },
      },
    },
  },
}))
</script>
```

The legacy nested map shape is still supported (`include: { posts: { comments: true } }`).

::: info
`params.with` is still available as a low-level Drizzle override. If both `include` and `params.with` are set, `params.with` takes precedence.
:::

## Allowing tables

By default, all tables in your Drizzle schema are exposed through the API. You can restrict the tables that are exposed by using the `allowTables` function.

::: tip
Put this code in a Nitro plugin in `server/plugins` so it's executed once when the server starts.
:::

```ts
import * as tables from 'path-to-your-drizzle-schema'

export default defineNitroPlugin(() => {
  allowTables([
    tables.todos,
  ])
})
```

Any table that is not explicitly listed will throw on all API endpoints with the error `Collection "<name>" is not allowed.`. `allowTables` can be called multiple times, and the allowed tables will be merged.

::: warning Maintenance
Once `allowTables` has been called at least once, the allow-list is active for the rest of the server's lifetime. Every new Drizzle table you later add to the schema must be registered here too — otherwise its generated endpoints will throw at runtime with `Collection "<name>" is not allowed.`. There is no opt-out: you cannot revert to the "all tables exposed" default once the allow-list has been initialized.
:::

## Realtime Updates <Badge text="New in v0.8" />

You can enable realtime updates using WebSockets by setting the `rstoreDrizzle.ws` option in your Nuxt config:

```ts
export default defineNuxtConfig({
  modules: [
    '@rstore/nuxt-drizzle',
  ],
  rstoreDrizzle: {
    ws: true,
  },
})
```

Then in your components, you can replace `query` with `liveQuery` (or manually call `subscribe`):

```vue
<script lang="ts" setup>
const store = useStore()

const { data: todos } = await store.todos.liveQuery(q => q.many())
</script>
```

When the websocket reconnects, the runtime plugin re-sends active subscriptions and then triggers `realtimeReconnectEventHook` from `@rstore/vue`. Existing `liveQuery` instances listen to that hook and call `refresh()`, which helps recover updates missed while the client was disconnected.

::: tip External realtime server
By default the client connects to the same Nuxt server that handles the REST API. If you host the WebSocket on a different origin, set [`ws.clientEndpoint`](#ws-clientendpoint) to the absolute URL the browser should connect to.
:::

By default the module uses an in-memory Pub/Sub implementation, which is enough for a single-process deployment. For multi-node setups, provide a custom implementation (backed by Redis, NATS, Postgres LISTEN/NOTIFY, …) by calling `setRstoreDrizzlePubSub` in a Nitro plugin:

```ts
// server/plugins/pubsub.ts
import type { RstoreDrizzlePubSub } from '@rstore/nuxt-drizzle/realtime'

export default defineNitroPlugin(() => {
  const pubsub: RstoreDrizzlePubSub = {
    subscribe(channel, callback) {
      // Subscribe to `channel` (currently only `'update'`) using your Pub/Sub
      // implementation and call `callback(payload)` for each message. Return
      // an unsubscribe function.
      return () => {
        // cleanup
      }
    },
    publish(channel, payload) {
      // Publish `payload` to `channel` using your Pub/Sub implementation.
    },
  }
  setRstoreDrizzlePubSub(pubsub)
})
```

::: tip Only one `update` channel
The built-in WebSocket handler publishes exclusively on the `'update'` channel, with a payload matching [`RstoreDrizzleRealtimePayload`](#server-client-update-messages). A compliant implementation only needs to handle that channel.
:::

If you run direct Drizzle queries outside the generated rstore endpoints, publish realtime updates manually so `liveQuery` subscribers stay in sync:

```ts
// server/api/todos/bulk-toggle.post.ts
export default defineEventHandler(async () => {
  const db = useDrizzle()

  const updatedTodos = await db
    .update(tables.todos)
    .set({ completed: true })
    .where(eq(tables.todos.completed, false))
    .returning()

  for (const todo of updatedTodos) {
    publishRstoreDrizzleRealtimeUpdate({
      collection: tables.todos, // table or collection name both work
      type: 'updated',
      record: todo,
      // optional: key can be inferred from the record primary key(s)
      // key: todo.id,
    })
  }

  return { updated: updatedTodos.length }
})
```

## Offline Mode <Badge text="New in v0.8" />

Turn on the offline mode by setting the `rstoreDrizzle.offline` option in your Nuxt config:

```ts
export default defineNuxtConfig({
  modules: [
    '@rstore/nuxt-drizzle',
  ],
  rstoreDrizzle: {
    offline: true,
  },
})
```

The module will automatically add the `@rstore/offline` plugin to the store, enabling offline support for all collections. You can customize which collections have offline support with the `filterCollection` option:

```ts
export default defineNuxtConfig({
  modules: [
    '@rstore/nuxt-drizzle',
  ],
  rstoreDrizzle: {
    offline: {
      filterCollection: collection => collection.name.startsWith('offline'),
    },
  },
})
```

## Batching <Badge text="New in v0.9" />

The module ships with built-in support for rstore's [batching](../guide/data/batching.md) layer. When you enable batching on the store, every eligible `findFirst`-by-key, `create`, `update` and `delete` from the same tick is folded into a single round-trip to a generated `POST {apiPath}/_batch` endpoint. The server dispatches each op in parallel and returns per-op results, so one failing op never blocks its siblings.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: [
    '@rstore/nuxt',
    '@rstore/nuxt-drizzle',
  ],
  rstore: {
    store: {
      batching: true, // or an options object — see the batching guide
    },
  },
})
```

All the usual `before` / `after` hooks (`item.get.before`, `index.post.before`, etc.) still fire per-op inside a batch, so permission checks and query transforms keep working unchanged.

## Hooks

You can use hooks to run code before or after certain actions on the collections. You can register global hooks for all collections using the `rstoreDrizzleHooks` import, or specific hooks for a given table using the `hooksForTable` function (recommended).

::: tip
Put this code in a Nitro plugin in `server/plugins` so it's executed once when the server starts.
:::

You can use the following hooks:

- `index.get.before` - before fetching a list of items
- `index.get.after` - after fetching a list of items
- `index.post.before` - before creating a new item
- `index.post.after` - after creating a new item
- `item.get.before` - before fetching a single item
- `item.get.after` - after fetching a single item
- `item.patch.before` - before updating a single item
- `item.patch.after` - after updating a single item
- `item.delete.before` - before deleting a single item
- `item.delete.after` - after deleting a single item
- `realtime.filter` - before sending a realtime update, allows to reject the update by calling `payload.reject()`

If you throw an error in a `before` hook, the action will be aborted and the error will be returned to the client.

```ts
import * as tables from 'path-to-your-drizzle-schema'

export default defineNitroPlugin(() => {
  hooksForTable(tables.todos, {
    'index.get.before': async (payload) => {
      console.log('Specific hook for todos - index.get.before', payload.collection, payload.query, payload.params)
    },
    'index.get.after': async (payload) => {
      console.log('Specific hook for todos - index.get.after', payload.collection, payload.result.map(r => r.id))
    },
    'item.patch.after': async (payload) => {
      console.log('Specific hook for todos - item.patch.after', payload.collection, payload.result.id)
    },
    'realtime.filter': async (payload) => {
      // Check for permissions here...
      if (payload.record.title === 'Error') {
        console.log('Rejecting realtime update for todo with title "Error"')
        payload.reject()
      }
    },
  })
})
```

<details>

<summary>You can also register global hooks for all tables.</summary>

```ts
export default defineNitroPlugin(() => {
  rstoreDrizzleHooks.hook('index.get.before', async (payload) => {
    console.log('index.get.before', payload.collection, payload.query, payload.params)
  })
  rstoreDrizzleHooks.hook('index.get.after', async (payload) => {
    console.log('index.get.after', payload.collection)
  })
  rstoreDrizzleHooks.hook('index.post.before', async (payload) => {
    console.log('index.post.before', payload.collection, payload.body)
  })
  rstoreDrizzleHooks.hook('index.post.after', async (payload) => {
    console.log('index.post.after', payload.collection)
  })
  rstoreDrizzleHooks.hook('item.get.before', async (payload) => {
    console.log('item.get.before', payload.collection, payload.params)
  })
  rstoreDrizzleHooks.hook('item.get.after', async (payload) => {
    console.log('item.get.after', payload.collection)
  })
  rstoreDrizzleHooks.hook('item.patch.before', async (payload) => {
    console.log('item.patch.before', payload.collection, payload.params, payload.body)
  })
  rstoreDrizzleHooks.hook('item.patch.after', async (payload) => {
    console.log('item.patch.after', payload.collection)
  })
  rstoreDrizzleHooks.hook('item.delete.before', async (payload) => {
    console.log('item.delete.before', payload.collection, payload.params)
  })
  rstoreDrizzleHooks.hook('item.delete.after', async (payload) => {
    console.log('item.delete.after', payload.collection)
  })
})
```

</details>

## Recipes

### Permission check with a query

Throwing an error in a `before` hook to prevent the action:

```ts
export default defineNitroPlugin(() => {
  hooksForTable(tables.projects, {
    'index.post.before': async ({ body }) => {
      const session = await requireUserSession(event)
      // Check that the user is a member of the team
      // they are trying to create the project for
      const teamId = body.teamId

      // Check that the user is a member of the team
      const membership = await useDrizzle()
        .select()
        .from(tables.teamsToUsers)
        .where(and(
          eq(tables.teamsToUsers.teamId, teamId),
          eq(tables.teamsToUsers.userId, session.user.id),
        ))
        .limit(1)
        .get()

      if (!membership) {
        throw createError({
          statusCode: 403,
          statusMessage: 'You are not a member of this team'
        })
      }
    },
  })
})
```

### Implicit permission check

By adding a SQL condition to the `where` clause of a query:

```ts
export default defineNitroPlugin(() => {
  hooksForTable(tables.projects, {
    'index.get.before': async ({ event, transformQuery }) => {
      const session = await requireUserSession(event)
      // Create a subquery to restrict the projects
      // to those that belong to teams the user is a member of
      const sq = useDrizzle()
        .select({ id: tables.projects.id })
        .from(tables.teamsToUsers)
        .innerJoin(tables.projects, eq(tables.projects.teamId, tables.teamsToUsers.teamId))
        .where(eq(tables.teamsToUsers.userId, session.user.id))
      // Use the subquery in the main query
      transformQuery(q => q.where(inArray(tables.projects.id, sq)))
    },
  })
})
```

### Automatic query

Automatically execute a query after a specific action:

```ts
export default defineNitroPlugin(() => {
  hooksForTable(tables.teams, {
    'index.post.after': async ({ event, result }) => {
      const session = await requireUserSession(event)
      // Add the user as a member of the newly created team
      await useDrizzle().insert(tables.teamsToUsers).values({
        teamId: result.id,
        userId: session.user.id,
      })
    },
  })
})
```

## Configuration

All options live under the `rstoreDrizzle` key in `nuxt.config.ts`.

```ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt-drizzle'],
  rstoreDrizzle: {
    // options go here
  },
})
```

| Option              | Type                                                        | Default                               | Description                                                                 |
| ------------------- | ----------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------- |
| `apiPath`           | `string`                                                    | `'/api/rstore'`                       | Base path of the generated REST + batch API routes.                         |
| `drizzleConfigPath` | `string`                                                    | `'drizzle.config.ts'`                 | Path to the Drizzle Kit config file, relative to the project root.          |
| `drizzleImport`     | `{ name: string, from: string }`                            | `{ name: 'useDrizzle', from: '~~/server/utils/drizzle' }` | Import used on the server to get the Drizzle instance.          |
| `ws`                | `boolean \| { apiPath?: string, clientEndpoint?: string, heartbeatInterval?: number, autoReconnect?: boolean \| { retries?: number, delay?: number } }`  | `false`                               | Enables WebSocket-based realtime updates. See [Realtime Updates](#realtime-updates). |
| `offline`           | `boolean \| OfflinePluginOptions`                           | `false`                               | Enables the offline plugin. See [Offline Mode](#offline-mode).              |

### apiPath

Customize the path to the REST API. The generated endpoints are:

- `GET    {apiPath}/:collection` — list items
- `POST   {apiPath}/:collection` — create item
- `GET    {apiPath}/:collection/:key` — fetch single item
- `PATCH  {apiPath}/:collection/:key` — update item
- `DELETE {apiPath}/:collection/:key` — delete item
- `POST   {apiPath}/_batch` — batched operations (see [Batching](#batching))

```ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt-drizzle'],
  rstoreDrizzle: {
    apiPath: '/api/my-api',
  },
})
```

### drizzleConfigPath

Customize the path to the Drizzle config file. By default it will look for a `drizzle.config.ts` file in the root of your project.

The module reads the `dialect` and `schema` fields from that config to generate collections, so the path must resolve to a valid Drizzle Kit config at build time.

```ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt-drizzle'],
  rstoreDrizzle: {
    drizzleConfigPath: 'config/drizzle.config.ts',
  },
})
```

### drizzleImport

Customize the import used server-side to get the Drizzle instance. By default the module imports `useDrizzle` from `~~/server/utils/drizzle`. This is what every generated API handler calls to run queries.

```ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt-drizzle'],
  rstoreDrizzle: {
    drizzleImport: {
      name: 'useDb',
      from: '~~/server/useDb',
    },
  },
})
```

### ws

Enables realtime updates. Pass `true` to use the defaults, or an object to customize the server route and/or the client-side endpoint.

```ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt-drizzle'],
  rstoreDrizzle: {
    ws: {
      apiPath: '/api/my-realtime/ws',
      clientEndpoint: 'wss://realtime.example.com/ws',
    },
  },
})
```

#### ws.apiPath

Server-side route where the generated WebSocket handler is registered (defaults to `/api/rstore-realtime/ws`). When `ws.clientEndpoint` is not set, this is also the URL the client connects to.

#### ws.clientEndpoint <Badge text="New in v0.9" />

Fully overrides the URL the client uses to connect to the realtime WebSocket. Useful when the WebSocket server is hosted on a **different origin** (for example a dedicated realtime service, a separate Nitro deployment, or a non-Nitro WebSocket backend).

Accepted formats:

- absolute URL: `'wss://realtime.example.com/ws'`
- protocol-relative URL: `'//realtime.example.com/ws'`
- same-origin path: `'/ws'`

```ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt-drizzle'],
  rstoreDrizzle: {
    ws: {
      // Server handler still registered at the default `ws.apiPath`,
      // but the browser connects to the external realtime service.
      clientEndpoint: 'wss://realtime.example.com/ws',
    },
  },
})
```

::: tip Using runtime config
To make the endpoint environment-dependent (different URL per deploy), combine this option with Nuxt's runtime config and assign it from an environment variable, for example inside a [Nuxt hook](https://nuxt.com/docs/4.x/api/advanced/hooks) or directly inside `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt-drizzle'],
  rstoreDrizzle: {
    ws: {
      clientEndpoint: process.env.NUXT_PUBLIC_RSTORE_WS_ENDPOINT,
    },
  },
})
```

:::

::: warning Same-origin defaults
When `ws.clientEndpoint` is omitted, `@vueuse/core`'s `useWebSocket` resolves the path against the current page origin. If your app is served from a different domain than your API, either set `clientEndpoint` explicitly or use an absolute URL.
:::

#### ws.heartbeatInterval <Badge text="New in v0.9" />

Heartbeat interval in milliseconds (default `10000`). The client sends a `ping` text frame at this rate; the server replies with `pong`. Missed replies trigger reconnection via `@vueuse/core`.

```ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt-drizzle'],
  rstoreDrizzle: {
    ws: {
      heartbeatInterval: 5000,
    },
  },
})
```

#### ws.autoReconnect <Badge text="New in v0.9" />

Auto-reconnect configuration forwarded to `@vueuse/core`'s `useWebSocket`. Pass `true` (default) for sensible defaults, `false` to disable, or an object to tune retries / delay.

```ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt-drizzle'],
  rstoreDrizzle: {
    ws: {
      autoReconnect: {
        retries: 10,
        delay: 2000,
      },
    },
  },
})
```

### offline

Enables offline support. On top of installing the `@rstore/offline` plugin, the module also registers a Drizzle-specific sync plugin that uses the generated REST API (with `updatedAt`-based incremental sync and deletion detection) to keep the local cache in sync with the database.

Pass `true` to enable with defaults, or an object to forward options to `createOfflinePlugin` (such as `filterCollection`) and to customize the Drizzle-level sync (for example `serializeDateValue`). See [Offline Mode](#offline-mode) for details.

```ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt-drizzle'],
  rstoreDrizzle: {
    offline: true,
  },
})
```

## Realtime Protocol

The realtime plugin talks to the server over a single WebSocket using JSON text frames. The protocol is small enough that you can re-implement the server end on a different stack (a Go/Rust service, an edge worker, a standalone Node server, etc.) and still use the built-in client by pointing [`ws.clientEndpoint`](#ws-clientendpoint) at it.

### Connection

- **Transport**: a single WebSocket connection per tab.
- **URL**: `ws.clientEndpoint` if set, otherwise `ws.apiPath` resolved against the current origin (so `ws://` / `wss://` is chosen automatically).
- **Subprotocol**: none — the client does not negotiate a subprotocol.
- **Encoding**: all application messages are UTF-8 JSON strings, with the exception of the heartbeat frames (see below).

### Heartbeat

Every 10 seconds while the connection is open, the client sends the literal text frame:

```
ping
```

The server **must** reply with the literal text frame:

```
pong
```

These two frames are not JSON — they are the raw strings `ping` and `pong`. The client ignores incoming `pong` frames (they are only used by `@vueuse/core`'s `useWebSocket` to detect a dead connection and trigger reconnect).

### Reconnection

The client uses `@vueuse/core`'s `autoReconnect`. On each successful reconnect it:

1. Resends every currently active subscription as a fresh `subscribe` message.
2. Triggers `realtimeReconnectEventHook` from `@rstore/vue`, which causes all live queries to call `refresh()` (this recovers updates missed while offline).

A custom server does not need to persist anything across reconnects — the client is authoritative about which subscriptions are active.

### Client → Server: init frame <Badge text="New in v0.9" />

Immediately after the socket opens (and again on every reconnect), the client sends a one-off frame announcing its stable per-tab id:

```json
{ "init": { "clientId": "f3d3c0cb-1e9e-4d35-9b6a-3b4a2c0ed77d" } }
```

The server stores this id on the peer so it can **skip forwarding an update** back to the peer that caused it — see [Skip-self echo suppression](#skip-self-echo-suppression). The `clientId` is also sent on every REST + batch request as the `X-Rstore-Client-Id` header.

A custom server that does not care about echo suppression can safely ignore `init` frames.

### Client → Server: subscription messages

Subscription management is driven entirely by the client. Every `liveQuery` / explicit `subscribe` call emits a JSON frame shaped like:

```ts
interface ClientMessage {
  subscription: SubscriptionMessage
}

interface SubscriptionMessage {
  action: 'subscribe' | 'unsubscribe'
  /** Collection name — matches the exported variable name in the Drizzle schema. */
  collection: string
  /** Primary key (or composite key as `"a::b"`) when subscribing to a single item. */
  key?: string | number
  /** Optional filter, same JSON shape as the `where` option of `query()`. */
  where?: RstoreDrizzleCondition
}
```

Example — subscribe to all published `posts`:

```json
{
  "subscription": {
    "action": "subscribe",
    "collection": "posts",
    "where": { "op": "eq", "field": "published", "value": true }
  }
}
```

Example — subscribe to a single todo:

```json
{
  "subscription": {
    "action": "subscribe",
    "collection": "todos",
    "key": "42"
  }
}
```

Example — unsubscribe (same shape as the original subscribe, with `action: 'unsubscribe'`):

```json
{
  "subscription": {
    "action": "unsubscribe",
    "collection": "todos",
    "key": "42"
  }
}
```

The client deduplicates subscriptions locally using a subscription id built from `collection | key | where`. A given `(collection, key, where)` tuple is only sent to the server once, even if multiple components subscribe to it. The matching `unsubscribe` is only emitted when the last subscriber is torn down.

#### Matching semantics

A server implementation should only deliver an update frame to a peer when **all** of these are true for at least one of that peer's active subscriptions:

- `subscription.collection === update.collection`
- `subscription.key == null` **or** `subscription.key === update.key`
- `subscription.where == null` **or** the updated `record` satisfies the `where` filter

The `where` payload uses the same JSON operator tree as client-side queries (see [`RstoreDrizzleCondition`](https://github.com/Akryum/rstore/blob/main/packages/nuxt-drizzle/src/runtime/utils/types.ts)).

::: tip Helpers
The types and helpers needed to build a compatible server (or a non-Vue client) are exposed as a dedicated, zero-runtime-dependency entry point:

```ts
import type {
  ClientInitMessage,
  RstoreDrizzleCondition,
  SubscriptionMessage,
  SubscriptionUpdateMessage
} from '@rstore/nuxt-drizzle/realtime'
import {
  filterWhere, // matches a record against a `where` subscription filter
  getSubscriptionId, // canonical subscription id used for de-duplication
  normalizeSubscriptionKey // stringifies a subscription key for safe comparison
} from '@rstore/nuxt-drizzle/realtime'
```

This subpath pulls in no Nuxt / Vue / Drizzle runtime, so it is safe to import from a standalone Node, Bun, Deno, or edge service.
:::

### Server → Client: update messages

When the server wants to push a change to a peer, it sends a JSON frame:

```ts
interface ServerMessage {
  update: SubscriptionUpdateMessage
}

interface SubscriptionUpdateMessage {
  collection: string
  type: 'created' | 'updated' | 'deleted'
  /** The full row, as returned by a matching `SELECT *`. Required for all types, including `deleted`. */
  record: Record<string, unknown>
  /**
   * Primary key value (stringified; composite keys joined with `::`).
   * Required for `updated` and `deleted`. Undefined / omitted for `created`.
   */
  key?: string
  /**
   * Optional client id of the peer that triggered the mutation. When set,
   * the realtime handler skips sending the update back to the peer whose
   * `init.clientId` matches.
   */
  originClientId?: string
}
```

Example — row created:

```json
{
  "update": {
    "collection": "todos",
    "type": "created",
    "record": { "id": 42, "title": "Ship the docs", "completed": false }
  }
}
```

Example — row deleted:

```json
{
  "update": {
    "collection": "todos",
    "type": "deleted",
    "key": "42",
    "record": { "id": 42, "title": "Ship the docs", "completed": true }
  }
}
```

On receipt, the client reacts as follows:

| `type`    | Action on the normalized cache                                                    |
| --------- | --------------------------------------------------------------------------------- |
| `created` | `store.$cache.writeItem({ collection, key: collection.getKey(record), item: record })` |
| `updated` | same as `created` (upsert by key)                                                 |
| `deleted` | `store.$cache.deleteItem({ collection, key })`                                    |

Because the `created` / `updated` branches both derive the key from `record` via the collection's `getKey` function, a custom server only needs to send a complete `record` for those types. For `deleted`, include both `record` and `key` — the key is the authoritative identifier and `record` is kept for consistency and for future hook payloads.

### Skip-self echo suppression <Badge text="New in v0.9" />

When a mutation originates from a specific tab, the server generally shouldn't send the resulting `update` frame back to that same tab — the client has already applied the optimistic / confirmed change and doesn't need the echo (which would otherwise cause a brief re-render flash).

The built-in client and server cooperate as follows:

1. The client generates a stable `clientId` per tab (UUID) and sends it once on `OPEN` inside an `init` frame.
2. The same id is sent on every REST + batch request as the `X-Rstore-Client-Id` header.
3. The built-in `publish-hooks` plugin reads the header and passes it to `publishRstoreDrizzleRealtimeUpdate` as `originClientId`.
4. The WebSocket handler stores each peer's `clientId` and skips forwarding any update whose `originClientId` matches.

If you publish updates yourself (for example from a bulk Drizzle query), pass `originClientId` through manually to keep the behavior:

```ts
publishRstoreDrizzleRealtimeUpdate({
  collection: tables.todos,
  type: 'updated',
  record: todo,
  originClientId: getHeader(event, 'x-rstore-client-id') ?? undefined,
})
```

### Composite primary keys

When a collection has a composite primary key (multiple columns marked as primary), keys are serialized by joining the string values of each primary column with `::`, in the order they appear in `collection.meta.primaryKeys`.

For example, a `teamsToUsers` collection with primary keys `['teamId', 'userId']` and row `{ teamId: 7, userId: 42 }` yields the key `"7::42"`. The client uses the same rule in `collection.getKey`, so `update.key` must match exactly.

### Errors

The client does not parse or act on any error frame format. If a peer sends invalid JSON or a frame the client cannot handle, it logs `[Realtime] Failed to handle websocket message` and keeps the connection open. A custom server is free to close the socket on protocol violations — the client will auto-reconnect and resubscribe.

### Minimal custom server checklist

To be compatible with the built-in client, a custom realtime server must:

1. Accept WebSocket connections at the URL the client connects to (matches [`ws.clientEndpoint`](#ws-clientendpoint)).
2. Reply to `ping` text frames with `pong`.
3. Parse incoming JSON frames and maintain per-connection subscriptions keyed by `collection`, `key`, and `where`. **Coerce `subscription.key` to a string on receipt** so strict comparisons against publisher-emitted string keys don't silently miss (`"42" !== 42`).
4. Optionally honor the `init` frame (`{ init: { clientId } }`) to implement [skip-self echo suppression](#skip-self-echo-suppression) — if a peer's `clientId` matches the `originClientId` on an update, skip that peer.
5. Whenever the underlying data changes, push JSON `{ "update": { collection, type, record, key?, originClientId? } }` frames to every peer with at least one matching subscription.
6. Clean up subscriptions when the connection closes.

### Running outside Nuxt / Nitro

Everything you need to build a standalone realtime server — the protocol types, the `where`-filter evaluator, and the Pub/Sub primitives — is exported from the `@rstore/nuxt-drizzle/realtime` subpath. This entry point pulls in **no Nuxt, Nitro, Vue, Drizzle, H3, or crossws runtime**, so it works in plain Node, Bun, Deno, Cloudflare Workers, etc.

```ts
import type {
  PubSub,
  RstoreDrizzleCondition,
  RstoreDrizzlePubSub,
  RstoreDrizzlePubSubChannels,
  SubscriptionMessage,
  SubscriptionUpdateMessage
} from '@rstore/nuxt-drizzle/realtime'
import {
  createMemoryPubSub,
  filterWhere,
  getPubSub,
  getSubscriptionId,
  setPubSub,
  usePeerPubSub
} from '@rstore/nuxt-drizzle/realtime'
```

All symbols behave exactly like their Nitro auto-imported counterparts — `setPubSub` is the non-prefixed form of `setRstoreDrizzlePubSub`, and the in-memory instance returned by `createMemoryPubSub()` is the same one installed by default inside Nuxt.

#### Example — standalone WebSocket server (Node / `ws`)

The skeleton below speaks the full protocol against any `ws`-compatible WebSocket server. Drop in your own database change source where marked, and the built-in client (pointed at this service via [`ws.clientEndpoint`](#ws-clientendpoint)) will receive live updates.

```ts
import type {
  ClientInitMessage,
  RstoreDrizzlePubSub,
  SubscriptionMessage,
  SubscriptionUpdateMessage
} from '@rstore/nuxt-drizzle/realtime'
// realtime-server.ts
import {
  createMemoryPubSub,
  filterWhere,
  getSubscriptionId,
  normalizeSubscriptionKey,
  setPubSub,
  usePeerPubSub
} from '@rstore/nuxt-drizzle/realtime'
import { WebSocketServer } from 'ws'

// Swap with a Redis / NATS / Postgres implementation for multi-node setups.
const pubsub: RstoreDrizzlePubSub = createMemoryPubSub()
setPubSub(pubsub)

const wss = new WebSocketServer({ port: 3001 })

// Must match the SQL dialect configured in `drizzle.config.ts`
// (only affects case-insensitive `like` / `ilike` matching).
const DIALECT = 'sqlite'

wss.on('connection', (socket) => {
  const peerId = crypto.randomUUID()
  const peerPubSub = usePeerPubSub(peerId)
  const subscriptions = new Map<string, SubscriptionMessage>()
  let clientId: string | undefined
  let off: (() => void) | undefined

  socket.on('message', (raw) => {
    const text = raw.toString('utf8')

    // Heartbeat
    if (text === 'ping') {
      socket.send('pong')
      return
    }

    let message: { subscription?: SubscriptionMessage, init?: ClientInitMessage }
    try {
      message = JSON.parse(text)
    }
    catch {
      return
    }

    // Client id handshake used for skip-self echo suppression.
    if (message.init?.clientId) {
      clientId = message.init.clientId
      return
    }

    const sub = message.subscription
    if (!sub)
      return

    // Normalize the key to a string — publishers always emit string keys.
    const normalized: SubscriptionMessage = {
      ...sub,
      key: sub.key != null ? normalizeSubscriptionKey(sub.key) : undefined,
    }
    const id = getSubscriptionId(normalized)

    if (sub.action === 'subscribe' && !subscriptions.has(id)) {
      subscriptions.set(id, normalized)
      // Attach a single pubsub listener per peer and match against the
      // peer's subscription map in memory.
      if (!off) {
        off = peerPubSub.subscribe('update', (update) => {
          if (update.originClientId && clientId && update.originClientId === clientId)
            return

          let matched = false
          for (const s of subscriptions.values()) {
            if (s.collection !== update.collection)
              continue
            if (s.key != null && s.key !== update.key)
              continue
            if (s.where && !filterWhere(update.record, s.where, DIALECT))
              continue
            matched = true
            break
          }
          if (!matched)
            return

          socket.send(JSON.stringify({ update } satisfies { update: SubscriptionUpdateMessage }))
        })
      }
    }
    else if (sub.action === 'unsubscribe') {
      subscriptions.delete(id)
      if (subscriptions.size === 0 && off) {
        off()
        off = undefined
      }
    }
  })

  socket.on('close', () => {
    if (off)
      off()
    peerPubSub.unsubscribeAll()
  })
})

// Wherever your database changes happen, publish through the pub/sub.
// The payload matches `RstoreDrizzleRealtimePayload`.
export function publishUpdate(update: SubscriptionUpdateMessage) {
  pubsub.publish('update', update)
}
```

In your Nuxt app, just point the client at it:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt-drizzle'],
  rstoreDrizzle: {
    ws: {
      clientEndpoint: 'wss://realtime.example.com',
    },
  },
})
```

::: tip Hooks stay Nitro-only
The `realtime.filter` hook, `publishRstoreDrizzleRealtimeUpdate`, and `hooksForTable` rely on the generated collection metadata and the H3 peer object, so they are only available as Nitro server auto-imports. A standalone server is expected to enforce permissions inline (typically inside the `subscribe` handler shown above, before forwarding the `update` frame to the socket).
:::
