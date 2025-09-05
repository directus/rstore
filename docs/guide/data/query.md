# Querying Data

For each model, the store a set of functions to query the data. It can be accessed by using the model name: `store.<model_name>.<method>`.

Here are some examples:

```ts{3-4,8-9}
const store = await createStore({
  schema: [
    { name: 'Todo' },
    { name: 'users' },
  ],
  plugins: [],
})
const { data: todos } = store.Todo.query(q => q.many())
const { data: users } = store.users.query(q => q.many())
```

## Query composables

The query composables are the recommended way to fetch data from the server. They are designed to be used in a Vue component and return a reactive result to be used in the components.

The `query` and `liveQuery` composables return an object with the following properties:

- `data`: a ref that contains the data.

- `loading`: a ref that indicates whether the data is being fetched.

- `error`: a ref that contains the error if the data could not be fetched.

- `refresh`: a function that can be called to refresh the data.

- `meta`: a ref that contains a metadata object that can modified by plugins.

The composables also return a promise so they can be used with async setup.

```vue
<script setup>
const store = useStore()
// Plays nice with Nuxt SSR!
const { data: todos } = await store.Todo.query(q => q.many())
</script>
```

### Query first

With the `first` query buillder method, the `query` function can be used the first item that matches the key or the filter in the cache and fetches it if not found.

```ts
const { data: todo } = store.Todo.query(q => q.first('some-key'))
```

```ts
const someKey = ref('some-key')

const { data: todo } = store.Todo.query(q => q.first(someKey))
```

```ts
const route = useRoute()

const { data: todo } = store.Todo.query(q =>
  q.first(route.params.someKey))
```

Example with filtering:

```ts
const email = ref('cat@acme.com')

const { data: someUsers } = store.User.query(q => q.first({
  filter: item => item.email === email.value,
  params: {
    email: email.value,
  },
}))
```

::: info
Why specify the `params` in the query? The `params` are used to fetch the data from the server. By design, we want to compute the result also on the client side -- hence the `filter` function. The `params` are used to fetch the data from the server and are accessible in the [Plugin hooks](../plugin/hooks.md).

---

We can also create our own convention for the `params` and `filter`. For example, we could turn the `filter` option into an object that is both used to filter the data in the cache and to fetch the data from the server, using [plugin hooks](../plugin/hooks.md).
:::

### Query many

With the `many` query buillder method, the `query` function can be used to find all items that match the (optional) filter in the cache or fetches them if not found.

```ts
const { data: todos } = store.Todo.query(q => q.many()) // All todos
```

```ts
const email = ref('@acme.com')
const { data: someUsers } = store.User.query(q => q.many({
  filter: item => item.email.endsWith(email.value),
  params: {
    email: {
      $like: `%${email.value}`,
    },
  },
}))
```

### Disabling a query

You can disable a query by returning the `{ enabled: false }` flag as the find options:

```ts
const enabled = ref(false)

const { data: todos } = store.Todo.query(q => q.many({
  enabled: enabled.value,
}))
```

```ts
const enabled = ref(false)

const { data: todo } = store.Todo.query(q => q.first(
  enabled.value ? 'some-id' : { enabled: false }
))
```

This syntax is useful when you use TS as it will allow guarding against nullish values at the same time:

```ts
const someItem = ref<Record<string, any> | null>(null)

const { data: parent } = store.Item.query(q => q.first(
  someItem.value
    ? {
        params: {
          // `someItem.value` is not nullish here
          id: someItem.value.parentId,
        }
      }
    : { enabled: false }
))
```

### Dependent queries

```ts
// Get the user
const { data: user } = store.User.query({ /* ... */ })

// Then get the user's projects
const { data: projects } = store.Project.query(q => q.many(
  user.value
    ? {
        params: {
          userId: user.value.id,
        }
      }
    : { enabled: false }
))
```

## Cache read

### Peek first

Read the first item that matches the key or the filter in the cache without doing any fetching.

```ts
const result = store.Todo.peekFirst('some-key')
```

With filtering:

```ts
const result = store.User.peekFirst({
  filter: item => item.email === 'cat@acme.com',
})
```

It can be used within a computed property or a watcher to reactively read an item from the cache:

```ts
const someKey = ref('some-key')

const cachedTodo = computed(() => store.Todo.peekFirst(someKey.value))
```

### Peek many

Read all items that match the (optional) filter in the cache without doing any fetching.

```ts
const todos = store.Todo.peekMany()

const someUsers = store.User.peekMany({
  filter: item => item.email.endsWith('@acme.com'),
})
```

It can be used within a computed property or a watcher to reactively read items from the cache:

```ts
const email = ref('@acme.com')

const cachedUsers = computed(() => store.User.peekMany({
  filter: item => item.email.endsWith(email.value),
}))
```

## Simple queries

### Find first

Find the first item that matches the key or the filter in the cache or fetches it if not found. The result is **not** reactive - the method is intended to be used for one-off queries. If you need the result to be reactive, use the `query` or `liveQuery` composables instead.

```ts
const todo = await store.Todo.findFirst('some-key')
```
With filtering:

```ts
const someUsers = await store.User.findFirst({
  filter: item => item.email === 'cat@acme.com',
  params: {
    email: 'cat@acme.com',
  },
})
```

### Find many

Find all items that match the (optional) filter in the cache or fetches them if not found. The result is **not** reactive - the method is intended to be used for one-off queries. If you need the result to be reactive, use the `query` or `liveQuery` composables instead.

```ts
const todos = await store.Todo.findMany()

const someUsers = await store.User.findMany({
  filter: item => item.email.endsWith('@acme.com'),
  params: {
    email: {
      $like: '%@acme.com',
    },
  },
})
```

## Fetch Policy

The fetch policy determines how the data is fetched from the server. The default fetch policy is `cache-first`, which means that the data is fetched from the cache first and then from the server if not found.

The fetch policy can be set globally in the store or per query.

### Global fetch policy

The global fetch policy can be set in the store configuration using `findDefaults`:

```ts
const store = createStore({
  schema,
  plugins,
  findDefaults: {
    fetchPolicy: 'cache-first',
  },
})
```

### Per query fetch policy

The fetch policy can be set per query using the `fetchPolicy` option:

```ts
const { data: todos } = store.Todo.query(q => q.many({
  fetchPolicy: 'fetch-only',
}))
```

### Possible fetch policies

* `cache-first` (default) means that the query will first try to fetch the data from the cache. If the data is not found in the cache, it will fetch the data from the adapter plugins.
* `cache-and-fetch` means that the query will first try to fetch the data from the cache. It will then fetch the data from the adapter plugins and update the cache.
* `fetch-only` means that the query will only fetch the data from the adapter plugins. The data will be stored in the cache when the query is resolved.
* `cache-only` means that the query will only fetch the data from the cache.
* `no-cache` means that the query will not use the cache and only fetch the data from the adapter plugins. No data will be stored in the cache.

## Items list

Usually we write list item components that are used to display a list of items. It is recommended to only pass the key to the list item component and then use `query` to fetch the data in the list item component. By default the fetch policy is `cache-first`, so the data will be red from the cache in the item component and no unnecessary requests will be made for each items.

The benefits are that the data is co-located with the component that uses it and there is no need to specify the types of the item prop again (usually a simple `id: string | number` is enough). The item component is also easier to potentially reuse in totally different contexts.

::: code-group

```vue [TodoList.vue]
<script lang="ts" setup>
const store = useStore()
const { data: todos } = await store.Todo.query(q => q.many())
</script>

<template>
  <!-- Only pass the id here -->
  <TodoItem
    v-for="{ id } in todos"
    :id
    :key="id"
  />
</template>
```

```vue [TodoItem.vue]
<script lang="ts" setup>
const props = defineProps<{
  // Easy to type prop
  id: string
}>()

const store = useStore()
// No additional request is made here, the data is read from the cache
const { data: todo } = await store.Todo.query(q => q.first(props.id))
// Enjoy inferred types here too!
</script>
```

:::

## Co-locating queries

The best of both worlds! You can co-locate the queries with the components that use them, while still enjoying the benefits of a centralized store thanks to the cache -- letting it deduplicating and synchronizing all components. This is a powerful pattern that improves the independence of components and thus their maintainability.

::: code-group

```vue [AppHeader.vue]
<script lang="ts" setup>
const store = useStore()
// The query is co-located with the component, not in a store somewhere else
const { data: user } = await store.User.query(q => q.first('user-id'))
</script>

<template>
  <div>
    <h1>{{ user.name }}</h1>
  </div>
</template>
```

```vue [UserProfile.vue]
<script lang="ts" setup>
const store = useStore()
// The centralized cache ensures that the data is up to date here too
const { data: user } = await store.User.query(q => q.first('user-id'))
</script>

<template>
  <div>
    <h1>{{ user.name }}</h1>
    <p>{{ user.email }}</p>
  </div>
</template>
```

:::

## Fetching relations

You can pass an `include` option to the query to fetch related data. The `include` option is an object where the keys are the names of the relations. Learn more about how to define relations [here](../model/relations.md).

```ts
const { data: comments } = store.comments.query(q => q.many({
  include: {
    author: true,
    relatedPost: { // Nested relation
      author: true,
      topComments: true,
    },
  },
}))
```

The cache will automatically resolve the relations as soon as the data is available in the cache.

Plugins hooked on the `fetchRelations` hook will also be called to potentially fetch the data of the relations. See [Plugin hooks](../plugin/hooks.md#fetching-relations) for more details.

## Customizing Find Options Types

You can customize the `FindOptions` type used in the `first` and `many` query builder methods and in the `peek*`/`find*` methods by declaring a module augmentation for `@rstore/vue` and extending the `FindOptions` interface.

Create a `rstore.d.ts` file in your project with the following content:

```ts
declare module '@rstore/vue' {
  export interface FindOptions<
    TModel extends Model,
    TModelDefaults extends ModelDefaults,
    TSchema extends StoreSchema,
  > extends FindOptionsBase<TModel, TModelDefaults, TSchema> {
    // Your custom properties here

    // For example, replace the `filter` property with a custom syntax
    filter?: MyFilterSyntax
  }
}

export {}
```
