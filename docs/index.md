---
layout: page
---

<script setup>
import HomePage from './components/HomePage.vue'
</script>

<HomePage />

<div class="text-5xl font-bold text-center p-24 pb-0">
  Get Productive Real Fast
</div>

<main class="max-w-[1152px] mx-auto p-12 vp-doc">

## Quick Overview

1. Define your [Collections](./guide/schema/collection.md)

2. Use [Plugins](./guide/plugin/setup.md) to reuse fetching logic for multiple collections

3. [Query](./guide/data/query.md) or [Mutate](./guide/data/mutation.md) your data in your components:

```vue
<script lang="ts" setup>
// Inject the store instance
const store = useStore()

// Live query to get all todos
const { data: todos, loading } = await store.todos.liveQuery(q => q.many())

// Form object to create a new todo
const createTodo = store.todos.createForm({
  defaultValues: () => ({
    id: crypto.randomUUID(),
  }),
})
const createInput = useTemplateRef('input')
createTodo.$onSuccess(() => {
  createInput.value?.inputRef?.focus()
  createInput.value?.inputRef?.select()
})

// Mutation
async function deleteTodo(id: string) {
  await store.todos.delete(id)
}
</script>

<template>
  <div>
    <TodoItem v-for="todo in todos" :key="todo.id" :todo @delete="deleteTodo(todo.id)" />

    <UForm :state="createTodo" :schema="createTodo.$schema">
      <UInput
        ref="input"
        v-model="createTodo.title"
        placeholder="New todo"
        :disabled="createTodo.$loading"
        @keydown.enter.prevent="createTodo.$submit()"
      />
    </UForm>
  </div>
</template>
```

[Learn more](./guide/getting-started.md)

<h2 class="text-3xl! font-bold! mb-6 mt-12 flex items-center gap-4">
  <img src="/nuxt.svg" class="size-20 inline"> Nuxt Integration
</h2>

Integrate RStore seamlessly into your Nuxt.js applications with the official RStore Nuxt module. This module simplifies the setup process and provides automatic configuration for optimal performance.

```bash
pnpm install @rstore/nuxt
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt'],
})
```

[Learn more](./guide/getting-started.md#nuxt)

<h2 class="text-3xl! font-bold! mb-6 mt-12 flex items-center gap-4">
  <img src="/drizzle-logo.png" class="size-20 inline rounded-full"> Nuxt + Drizzle
</h2>

This Nuxt module integrates RStore with Drizzle ORM. In very few steps, you can get access to your data directly in your components without setting up an API yourself.

It comes with builtin support for:

- 🧾 Typed collections from Drizzle schema
- 🧑‍💻 Server-side data fetching with RStore
- 🔄 Realtime updates with WebSockets
- 📲 Offline support with automatic synchronization

```bash
pnpm install @rstore/nuxt-drizzle
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt-drizzle'],
  rstoreDrizzle: {
    ws: true,
    offline: true,
  },
})
```

```ts
// server/utils/drizzle.ts
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../database/schema'

export const tables = schema

let drizzleInstance

export function useDrizzle() {
  drizzleInstance ??= drizzle({
    schema,
    connection: useRuntimeConfig().dbUrl,
  })
  return drizzleInstance
}
```

[Learn more](./plugins/nuxt-drizzle.md)

<h2 class="text-3xl! font-bold! mb-6 mt-12 flex items-center gap-4">
  <img src="/directus-logo.svg" class="size-20 inline rounded-full"> Nuxt + Directus
</h2>

Easily connect your Nuxt.js application to a Directus CMS using the RStore Nuxt module. You app will automatically get access to your Directus collections.

```bash
pnpm install @rstore/nuxt-directus
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@rstore/nuxt-directus'],
})
```

[Learn more](./plugins/nuxt-directus.md)

</main>
