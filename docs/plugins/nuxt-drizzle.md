# Nuxt + Drizzle

[Online Demo](https://codesandbox.io/p/devbox/wonderful-sun-s4cgl6)

In case you are using [Drizzle](https://orm.drizzle.team), you can install the `@rstore/nuxt-drizzle` module instead of `@rstore/nuxt` to automatically generate the models and plugins from your drizzle schema.

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
- generate the models from the schema for each table with the relations,
- generate a REST API under the `/api/rstore` path to handle the CRUD operations,
- generate a plugin to handle the queries and mutations,
- generate all the necessary types for the models and the API.

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

const { data: todos } = await store.todos.queryMany()
</script>

<template>
  <pre>{{ todos }}</pre>
</template>
```

::: tip Model Names
The model names are infered from the exported variable names in the drizzle schema, **not** the table names.
:::

::: tip
You can use [nitro middlewares](https://nitro.build/guide/routing#middleware) to add authentication to the API, for example in a `server/middleware/auth.ts` file.
:::

## Filtering

You can use the `where` option of any [query](./data/query.md) to filter the results using drizzle's operators such as `eq`, `gt`, `lt`, etc. (which are auto-imported). Since rstore is local-first, it will also compute the where clause on the client side.

The supported operators are defined [here](https://github.com/Akryum/rstore/blob/main/packages/nuxt-drizzle/src/runtime/utils/types.ts#L5) ([drizzle docs](https://orm.drizzle.team/docs/operators)).

```vue
<script lang="ts" setup>
const store = useStore()

const email = ref('')

const { data: users } = await store.users.queryMany(() => ({
  where: email.value ? eq('email', email.value) : undefined,
}))
</script>
```

::: info
Please note that only simple filters are supported - you can't do joins or subqueries inside `where`.
:::

## Relations

You can use the `include` option to include related models in the query. [Learn more here](./model/relations.md).

```vue
<script lang="ts" setup>
const store = useStore()

const { data: users } = await store.users.queryMany(() => ({
  include: {
    posts: true,
  },
}))
</script>
```

## Configuration

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
      default: { name: 'useDb', from: '~~/server/useDb' },
    },
  },
})
```
