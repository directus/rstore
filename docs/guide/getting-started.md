# Getting Started

rstore is a data store allowing you to handle all data in your application.

Define a data model and then run queries or execute mutations (create, update and delete) on your data.

**FEATURES**

- **Normalized reactive cache** to ensure all components are up-to-date
- **Co-locate queries** within the components that need them
- **Fully adaptable** with plugins to fetch from any source (REST, GraphQL...)
- **Scale down** to small prototypes and **scale up** to big enterprise apps
- Query API designed for **local-first** and **realtime**
- **Form API** to handle form state and validation
- **TypeScript support** with full autocomplete
- **Nuxt module** with devtools

[Learn more](./learn-more.md)

<a href="https://directus.io" target="_blank" class="flex items-center justify-center gap-2 mt-4 text-sm !no-underline hover:!underline !text-(--vp-c-text-1) bg-(--vp-c-text-1)/10 rounded-md p-4">
  <img src="/directus-black.svg" alt="directus logo" class="dark:!hidden size-8">
  <img src="/directus.svg" alt="directus logo" class="not-dark:!hidden size-8">
  <span>Backed by Directus</span>
</a>

## Vue

1. Install rstore:

::: code-group

```sh [npm]
npm i @rstore/vue
```

```sh [pnpm]
pnpm i @rstore/vue
```

:::

2. Create some Models:

::: code-group

```js [src/rstore/model.js]
import { defineDataModel } from '@rstore/vue'

export const todoModel = defineDataModel({
  name: 'todos',
})
```

```ts [src/rstore/model.ts]
import type { ModelList } from '@rstore/vue'
import { defineItemType } from '@rstore/vue'

// Item type
export interface Todo {
  id: string
  text: string
  completed: boolean
  createdAt: Date
  updatedAt?: Date
}

// Model
const todoModel = defineItemType<Todo>().model({
  name: 'todos',
} as const)

export const models = [
  todoModel,
] as const satisfies ModelList
```

:::

::: tip
If you are using TypeScript, don't forget to add `as const` to enable type safety.
:::

3. Create a plugin to interact with an API:

::: code-group

```js [src/rstore/plugin.js]
import { definePlugin } from '@rstore/vue'

export default definePlugin({
  name: 'my-rstore-plugin',

  setup({ hook }) {
    // Register rstore hooks here
  },
})
```

:::

::: warning IMPORTANT
By default, rstore doesn't make any assumption about the way you fetch data in your app. Plugins can hook into it to provide fetching logic (for example to make requests to a REST API).
:::

Example for a simple REST API:

```js [src/rstore/plugin.js]
export default definePlugin({
  name: 'my-rstore-plugin',

  setup({ hook }) {
    hook('fetchFirst', async (payload) => {
      if (payload.key) {
        const result = await fetch(`/api/${payload.model.name}/${payload.key}`)
          .then(r => r.json())
        payload.setResult(result)
      }
    })

    hook('fetchMany', async (payload) => {
      const result = await fetch(`/api/${payload.model.name}`)
        .then(r => r.json())
      payload.setResult(result)
    })

    hook('createItem', async (payload) => {
      const result = await fetch(`/api/${payload.model.name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload.item),
      }).then(r => r.json())
      payload.setResult(result)
    })

    hook('updateItem', async (payload) => {
      const result = await fetch(`/api/${payload.model.name}/${payload.key}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload.item),
      }).then(r => r.json())
      payload.setResult(result)
    })

    hook('deleteItem', async (payload) => {
      await fetch(`/api/${payload.model.name}/${payload.key}`, {
        method: 'DELETE',
      })
    })
  },
})
```

::: info
In the future rstore will provide some builtin plugins for GraphQL, OpenAPI and other popular standards. Feel free to also share your own plugins with the community! 😸
:::

4. Create the store:

::: code-group

```js [src/rstore/index.js]
import { createStore } from '@rstore/vue'
import { todoModel } from './model'
import myPlugin from './plugin'

export async function rstore(app) {
  const store = await createStore({
    models: [
      todoModel,
    ],
    plugins: [
      myPlugin,
    ],
  })
}
```

```ts [src/rstore/index.ts]
import type { App } from 'vue'
import { createStore } from '@rstore/vue'
import { models } from './model'
import myPlugin from './plugin'

export async function rstore(app: App) {
  const store = await createStore({
    models,
    plugins: [
      myPlugin,
    ],
  })
}
```

:::

5. Expose the store to your components with a composable:

::: code-group

```js{1,8,11-17} [src/rstore/index.js]
const injectStoreKey = Symbol('rstore')

export async function rstore(app) {
  const store = await createStore({
    // ...
  })

  app.provide(injectStoreKey, store)
}

export function useStore () {
  const store = inject(injectStoreKey, null)
  if (store == null) {
    throw new Error('No rstore provided.')
  }
  return store
}
```

```ts{1,2,4,11,14-20} [src/rstore/index.ts]
import type { VueStore } from '@rstore/vue'
import type { InjectionKey } from 'vue'

const injectStoreKey = Symbol('rstore') as InjectionKey<VueStore<typeof model>>

export async function rstore(app: App) {
  const store = await createStore({
    // ...
  })

  app.provide(injectStoreKey, store)
}

export function useStore () {
  const store = inject(injectStoreKey, null)
  if (store == null) {
    throw new Error('No rstore provided.')
  }
  return store
}
```

:::

6. Add the store to your app:

```js
import { rstore } from './rstore'

app.use(rstore)
```

7. Use the store in a component:

```vue
<script setup>
import { useStore } from '@/rstore'

const store = useStore()

const { data: todos } = store.todos.queryMany()
</script>

<template>
  <pre>{{ todos }}</pre>
</template>
```

## Nuxt

The Nuxt module will automatically:
- scan the `rstore` folder in your Nuxt app for models,
- scan the `rstore/plugins` folder and register plugins (using `export default`),
- create the store
- handle SSR payload
- expose the `useStore` composable typed according to the model (from the `rstore` folder).

<br>

1. Install rstore and add it to the Nuxt config:

::: code-group

```sh [npm]
npm i @rstore/nuxt
```

```sh [pnpm]
pnpm i @rstore/nuxt
```

```ts{3} [nuxt.config.ts]
export default defineNuxtConfig({
  modules: [
    '@rstore/nuxt',
  ],
})
```

:::

2. Create some Models in the `rstore` (or `app/rstore`) folder of your Nuxt app:

::: code-group

```ts [app/rstore/todo.ts]
// One Model
export default defineItemType<Todo>().model({
  name: 'todos',
} as const)
```

```ts [app/rstore/multiple.ts]
// Multiple Models
export default [
  defineItemType<User>().model({
    name: 'users',
  } as const),

  defineItemType<Bot>().model({
    name: 'bots',
  } as const),
]
```

```ts [shared/types/model.ts]
// Item types

export interface Todo {
  id: string
  text: string
  completed: boolean
  createdAt: Date
  updatedAt?: Date
}

export interface User {
  id: string
  name: string
  email: string
}

export interface Bot {
  id: string
  name: string
}
```

:::

::: tip
If you are using TypeScript, don't forget to add `as const` to enable type safety.
:::

::: warning FILE SCANNING
The rstore module will only scan exported defaults in files in the `rstore` folder and not in nested folders. If you want to split the models in multiple folders, you need to re-export each variables (currently the module is looking for `export default` expressions) or use Nuxt layers (recommended).
:::

3. Create a plugin to interact with an API in the `rstore/plugins` folder:

::: code-group

```ts [app/rstore/plugins/my-plugin.ts]
import { definePlugin } from '@rstore/vue'

export default definePlugin({
  name: 'my-rstore-plugin',

  setup({ hook }) {
    // Register rstore hooks here
  },
})
```

:::

::: warning IMPORTANT
By default, rstore doesn't make any assumption about the way you fetch data in your app. Plugins can hook into it to provide fetching logic (for example to make requests to a REST API).
:::

Example for a simple REST API:

```js [src/rstore/plugin.ts]
export default definePlugin({
  name: 'my-rstore-plugin',

  setup({ hook }) {
    hook('fetchFirst', async (payload) => {
      if (payload.key) {
        const result = await $fetch(`/api/${payload.model.name}/${payload.key}`)
        payload.setResult(result)
      }
    })

    hook('fetchMany', async (payload) => {
      const result = await $fetch(`/api/${payload.model.name}`)
      payload.setResult(result)
    })

    hook('createItem', async (payload) => {
      const result = await $fetch(`/api/${payload.model.name}`, {
        method: 'POST',
        body: payload.item,
      })
      payload.setResult(result)
    })

    hook('updateItem', async (payload) => {
      const result = await $fetch(`/api/${payload.model.name}/${payload.key}`, {
        method: 'PATCH',
        body: payload.item,
      })
      payload.setResult(result)
    })

    hook('deleteItem', async (payload) => {
      await $fetch(`/api/${payload.model.name}/${payload.key}`, {
        method: 'DELETE',
      })
    })
  },
})
```

::: info
In the future rstore will provide some builtin plugins for GraphQL, OpenAPI and other popular standards. Feel free to also share your own plugins with the community! 😸
:::

4. Use the store in a component:

```vue
<script setup>
const store = useStore()

const { data: todos } = await store.todos.queryMany()
</script>

<template>
  <pre>{{ todos }}</pre>
</template>
```

Open the Nuxt devtools and check the `rstore` tab:

![Devtools screenshot of the models tab](./img/nuxt-devtools1.png)

![Devtools screenshot of the history tab](./img/nuxt-devtools2.png)

## Nuxt + Drizzle

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

Make sure to export a function called `useDrizzle` that returns the drizzle instance in your server utils so it can be auto-imported in the generated API.

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

### Filtering

You can use the `params.where` option of any [query](./data/query.md) to filter the results using drizzle's operators such as `eq`, `gt`, `lt`, etc. (which are auto-imported). Since rstore is local-first, it will also compute the where clause on the client side.

The supported operators are defined [here](https://github.com/Akryum/rstore/blob/main/packages/nuxt-drizzle/src/runtime/utils/types.ts#L5) ([drizzle docs](https://orm.drizzle.team/docs/operators)).

```vue
<script lang="ts" setup>
const store = useStore()

const email = ref('')

const { data: users } = await store.users.queryMany(() => ({
  params: {
    where: email.value ? eq('email', email.value) : undefined,
  },
}))
</script>
```

::: info
Please note that only simple filters are supported - you can't do joins or subqueries inside `where`.
:::

### Relations

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
