# Collection

The structure of your data is presented in rstore with Collections:

```ts
import type { StoreSchema } from '@rstore/vue'

const schema: StoreSchema = [
  { name: 'todos' },
  { name: 'users' },
  // more collections...
]
```

Each Collection defines information about the related item type. The only mandatory property is `name`, which can be different from the key in the collection map (see the above example).

Various applications can have different collections based on their specific requirements. For instance, a blogging platform might include a `Post` collection to denote a blog entry and a `Comment` collection for user feedback. Conversely, a project management tool might feature collections such as `Task`, `Project`, or `Milestone`.

::: code-group

```js{2-5} [rstore.js]
const store = await createStore({
  schema: [
    { name: 'todos' },
    { name: 'users' },
  ],
  plugins: [],
})
```

```ts{2-5} [rstore.ts]
const store = await createStore({
  schema: [
    withItemType<Todo>().defineCollection({ name: 'todos' }),
    withItemType<User>().defineCollection({ name: 'users' }),
  ],
  plugins: [],
})
```

:::

## Defining a Collection <Badge text="Changed in v0.7" type="warning" />

For JavaScript, you can use the `defineCollection` utility function to define a collection with auto-completion in your IDE:

```js
import { createStore, defineCollection } from '@rstore/vue'

const todoCollection = defineCollection({
  name: 'todos',
  // other properties...
})

const store = await createStore({
  schema: [
    todoCollection
  ],
  plugins: [],
})
```

For TypeScript, you should use the `withItemType` utility function instead to specify the type of the item, then call `collection` on it:

```ts
import { createStore, withItemType } from '@rstore/vue'

interface TodoType {
  id: string
  title: string
  completed: boolean
}

const todoCollection = withItemType<TodoType>().defineCollection({
  name: 'todos',
  // other properties...
})

const store = await createStore({
  schema: [
    todoCollection
  ],
  plugins: [],
})
```

::: info
The [currying](https://en.wikipedia.org/wiki/Currying) is necessary to specify the type of the item while still letting TypeScript infer the type of the collection. This is a limitation of TypeScript, and [it might improve in the future](https://github.com/microsoft/TypeScript/issues/26242).
:::

## Collection hooks <Badge text="New in v0.7" />

You can define hooks on the collection that will be called at different stages of the item lifecycle in the `hooks` option. The available hooks are:

- `fetchFirst`: fetch a single item by its key or by other parameters
- `fetchMany`: fetch multiple items
- `create`: create a new item
- `update`: update an existing item
- `delete`: delete an item

::: tip
Instead of defining the hooks in the collection, you can also create a plugin to handle the fetching logic for many collections at once and with a larger choice of hooks (see [Plugins](../plugin/setup.md)).
:::

Each hook receives a payload object with the following properties:
- `fetchFirst`:
  - `key` (optional): the key of the item to fetch
  - `params` (optional): additional parameters for the fetch
  - `include` (optional): dictionnary of related items to include (see [Relations](./relations.md))
- `fetchMany`:
  - `params` (optional): additional parameters for the fetch (if available)
  - `include` (optional): dictionnary of related items to include (see [Relations](./relations.md))
- `create`:
  - `item`: the item to create
- `update`:
  - `key`: the key of the item to update
  - `item`: the partial item to update
- `delete`:
  - `key`: the key of the item to delete

::: code-group

```js [todos.js]
export const todoCollection = defineCollection({
  name: 'todos',
  hooks: {
    async fetchFirst({ key, params, include }) {
      // Fetch the item from the server
      const response = await fetch(`/api/todos/${key}`)
      const data = await response.json()
      return data
    },
    async fetchMany({ params, include }) {
      // Fetch the items from the server
      const response = await fetch('/api/todos')
      const data = await response.json()
      return data
    },
    async create({ item }) {
      // Create the item on the server
      const response = await fetch('/api/todos', {
        method: 'POST',
        body: JSON.stringify(item),
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      return data
    },
    async update({ key, item }) {
      // Update the item on the server
      const response = await fetch(`/api/todos/${key}`, {
        method: 'PUT',
        body: JSON.stringify(item),
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      return data
    },
    async delete({ key }) {
      // Delete the item on the server
      await fetch(`/api/todos/${key}`, {
        method: 'DELETE',
      })
    },
  },
})
```

```ts [todos.ts]
export const todoCollection = withItemType<TodoType>().defineCollection({
  name: 'todos',
  hooks: {
    async fetchFirst({ key, params, include }) {
      // Fetch the item from the server
      const response = await fetch(`/api/todos/${key}`)
      const data = await response.json()
      return data
    },
    async fetchMany({ params, include }) {
      // Fetch the items from the server
      const response = await fetch('/api/todos')
      const data = await response.json()
      return data
    },
    async create({ item }) {
      // Create the item on the server
      const response = await fetch('/api/todos', {
        method: 'POST',
        body: JSON.stringify(item),
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      return data
    },
    async update({ key, item }) {
      // Update the item on the server
      const response = await fetch(`/api/todos/${key}`, {
        method: 'PUT',
        body: JSON.stringify(item),
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      return data
    },
    async delete({ key }) {
      // Delete the item on the server
      await fetch(`/api/todos/${key}`, {
        method: 'DELETE',
      })
    },
  },
})
```

```ts [Nuxt]
export const todoCollection = withItemType<TodoType>().defineCollection({
  name: 'todos',
  hooks: {
    fetchFirst: async ({ key, params }) => key
      ? $fetch(`/api/todos/${key}`, { query: params })
      : (await $fetch('/api/todos', { query: params }))[0],
    fetchMany: async ({ params }) => $fetch('/api/todos', { query: params }),
    create: async ({ item }) => $fetch('/api/todos', {
      method: 'POST',
      body: item,
    }),
    update: async ({ key, item }) => $fetch(`/api/todos/${key}`, {
      method: 'PATCH',
      body: item,
    }),
    delete: async ({ key }) => $fetch(`/api/todos/${key}`, {
      method: 'DELETE',
    }),
  },
})
```

:::

## Item Key

rstore uses a normalized cache to store the data. This means that each item is stored in a flat structure, and the key is used to identify the item in the cache.

The key is a unique identifier for the item. It can be a string, number, or any other type that can be used as a key in an object.

By default, rstore will try to use the `id` or `_id` property of the item as the key.

You can override this behavior by specifying the `getKey` method on the collection:

```ts
const todoCollection = defineCollection({
  name: 'todos',
  getKey: item => item.customId,
})
```

## Scope ID

The scope ID allows filtering which plugins will handle the collection. For example, if a collection has a scope A, only plugins with the scope A will be able to handle it by default. This is very useful to handle multiple data sources.

```ts
const todoCollection = defineCollection({
  name: 'todos',
  scopeId: 'main-backend',
  // Only plugins with the scopeId 'main-backend'
  // will be able to handle this collection by default
})
```

::: warning
If the scope ID is not defined, the collection will be handled by all plugins.
:::

Learn more about federation and multi-source [here](./federation.md).

## Collection metadata

The collection can have metadata that can be used to customize the behavior of the collection.

If you are using TypeScript, you can augment the type of `CustomCollectionMeta` to add your own properties:

```ts
declare module '@rstore/vue' {
  export interface CustomCollectionMeta {
    path: string
  }
}

export {}
```

In the collection, you can add the metadata to the `meta` property:

```ts
const todoCollection = defineCollection({
  name: 'Todo',
  meta: {
    path: '/todos',
  },
})
```

## Field configuration

Each field can be configured with some processing functions, with the `fields` property which is a map of field names to field configurations.

The field configuration can have the following properties:

- `parse`: a function that takes the raw value from the server and returns the parsed value. This is useful for parsing dates, numbers, etc.

- `serialize`: a function that takes the value from the cache and returns the serialized value. This is useful for serializing dates, numbers, etc.

Example:

```ts
const todoCollection = defineCollection({
  name: 'todos',
  fields: {
    createdAt: {
      parse: value => new Date(value),
      serialize: value => value.toISOString(),
    },
    completed: {
      parse: value => Boolean(value),
      serialize: value => Number(value),
    },
  },
})
```

## Computed fields

You can define computed fields in the collection. Computed fields are not stored in the cache, but they can be used to derive values from other fields.

For example, you can define a `fullName` computed field that concatenates the `firstName` and `lastName` fields:

```ts
const userCollection = defineCollection({
  name: 'users',
  computed: {
    fullName: item => `${item.firstName} ${item.lastName}`,
  },
})
```

You can then use the computed field in your application just like any other field:

```ts
const store = useStore()

const { data: user } = store.users.query(q => q.first('some-id'))

watchEffect(() => {
  console.log(user.value?.fullName) // This is a computed field
  // => John Doe
})
```

## Schema validation

You can define some default schema validation for your collection using the `schema` property. This is useful for validating the data for a create or update operation.

You can specify the schema for the `create` and `update` operations. The schema can be defined using any validation library that implements [Standard Schema](https://standardschema.dev/).

```ts
import { z } from 'zod'

const todoCollection = defineCollection({
  name: 'todos',
  formSchema: {
    create: z.object({
      title: z.string().min(1),
      completed: z.boolean().default(false),
    }),
    update: z.object({
      title: z.string().optional(),
      completed: z.boolean().optional(),
    }),
  },
})
```

You can then use the `$schema` property of the form objects to validate the data:

```vue
<!-- Example with Nuxt UI -->

<script setup>
const store = useStore()
const createTodo = store.todos.createForm()
</script>

<template>
  <UForm
    :state="createTodo"
    :schema="createTodo.$schema"
    @submit="createTodo.$submit()"
  >
    <!-- UFormFields here -->
  </UForm>
</template>
```

Learn more about [Form Objects](../data/form.md).
