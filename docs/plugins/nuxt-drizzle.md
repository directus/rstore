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
        icon: '🔒',
        title: 'Security',
        details: 'Easily restrict the tables exposed through the API with the `allowTables` function.',
      },
      {
        icon: '⚡',
        title: 'Realtime',
        details: 'Built-in support for realtime updates using WebSockets and Pub/Sub.',
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

[Online Demo](https://codesandbox.io/p/devbox/wonderful-sun-s4cgl6)

In case you are using [Drizzle](https://orm.drizzle.team), you can install the `@rstore/nuxt-drizzle` module instead of `@rstore/nuxt` to automatically generate the collections and plugins from your drizzle schema.

```sh
npm i @rstore/nuxt-drizzle
```

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: [
    '@rstore/nuxt-drizzle',
  ],
})
```

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
The collection names are infered from the exported variable names in the drizzle schema, **not** the table names.
:::

::: tip
You can use [nitro middlewares](https://nitro.build/guide/routing#middleware) to add authentication to the API, for example in a `server/middleware/auth.ts` file.
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

Any table that is not explicitly listed will throw on all API endpoints. `allowTables` can be called multiple times, and the allowed tables will be merged.

## Realtime Updates

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

By default the module will use a in-memory Pub/Sub implementation. You can use a custom implementation (for example with Redis) by calling `setRstoreDrizzlePubSub` in a Nitro plugin:

```ts
// server/plugins/pubsub.ts
export default defineNitroPlugin(() => {
  setRstoreDrizzlePubSub({
    subscribe: async (topic, callback) => {
      // Subscribe to the topic using your Pub/Sub implementation
      // and call the callback with the payload when a message is received
    },
    publish: async (topic, payload) => {
      // Publish the payload to the topic using your Pub/Sub implementation
    },
  }) // interface is `RstoreDrizzlePubSub`
})
```

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

### apiPath

Customize the path to the API. By default it will be `/api/rstore`.

```ts
export default defineNuxtConfig({
  modules: [
    '@rstore/nuxt-drizzle',
  ],
  rstoreDrizzle: {
    apiPath: '/api/my-api',
  },
})
```

### drizzleConfigPath

Customize the path to the drizzle config file. By default it will look for a `drizzle.config.ts` file in the root of your project.

```ts
export default defineNuxtConfig({
  modules: [
    '@rstore/nuxt-drizzle',
  ],
  rstoreDrizzle: {
    drizzleConfigPath: 'drizzle.config.ts',
  },
})
```

### drizzleImport

Customize the import path for the drizzle instance. By default it will look for a `useDrizzle` function in the `~~/server/utils/drizzle.ts` file.

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
