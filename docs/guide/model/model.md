# Model

The structure of your data is presented in rstore with Models:

```ts
import type { ModelList } from '@rstore/vue'

const models: ModelList = [
  { name: 'todos' },
  { name: 'users' },
  // more models...
]
```

Each Model defines information about the related item type. The only mandatory property is `name`, which can be different from the key in the model map (see the above example).

Various applications can have different models based on their specific requirements. For instance, a blogging platform might include a `Post` model to denote a blog entry and a `Comment` model for user feedback. Conversely, a project management tool might feature models such as `Task`, `Project`, or `Milestone`.

::: code-group

```js{2-5} [rstore.js]
const store = await createStore({
  models: [
    { name: 'todos' },
    { name: 'users' },
  ],
  plugins: [],
})
```

```ts{2-5} [rstore.ts]
const store = await createStore({
  models: [
    defineItemType<Todo>().model({ name: 'todos' }),
    defineItemType<User>().model({ name: 'users' }),
  ],
  plugins: [],
})
```

:::

## Defining a Model

For JavaScript, you can use the `defineDataModel` utility function to define a model with auto-completion in your IDE:

```js
import { createStore, defineDataModel } from '@rstore/vue'

const todoModel = defineDataModel({
  name: 'todos',
  // other properties...
})

const store = await createStore({
  models: [
    todoModel
  ],
  plugins: [],
})
```

For TypeScript, you should use the `defineItemType` utility function instead to specify the type of the item, then call `model` on it:

```ts
import { createStore, defineItemType } from '@rstore/vue'

interface TodoType {
  id: string
  title: string
  completed: boolean
}

const todoModel = defineItemType<TodoType>().model({
  name: 'todos',
  // other properties...
})

const store = await createStore({
  models: [
    todoModel
  ],
  plugins: [],
})
```

::: info
The [currying](https://en.wikipedia.org/wiki/Currying) is necessary to specify the type of the item while still letting TypeScript infer the type of the model. This is a limitation of TypeScript, and [it might improve in the future](https://github.com/microsoft/TypeScript/issues/26242).
:::

## Item Key

rstore uses a normalized cache to store the data. This means that each item is stored in a flat structure, and the key is used to identify the item in the cache.

The key is a unique identifier for the item. It can be a string, number, or any other type that can be used as a key in an object.

By default, rstore will try to use the `id` or `_id` property of the item as the key.

You can override this behavior by specifying the `getKey` method on the model:

```ts
const todoModel = defineDataModel({
  name: 'todos',
  getKey: item => item.customId,
})
```

## Scope ID

The scope ID allows filtering which plugins will handle the model. For example, if a model has a scope A, only plugins with the scope A will be able to handle it by default. This is very useful to handle multiple data sources.

```ts
const todoModel = defineDataModel({
  name: 'todos',
  scopeId: 'main-backend',
  // Only plugins with the scopeId 'main-backend'
  // will be able to handle this model by default
})
```

::: warning
If the scope ID is not defined, the model will be handled by all plugins.
:::

Learn more about federation and multi-source [here](./federation.md).

## Model metadata

The model can have metadata that can be used to customize the behavior of the model.

If you are using TypeScript, you can augment the type of `CustomModelMeta` to add your own properties:

```ts
declare module '@rstore/vue' {
  export interface CustomModelMeta {
    path: string
  }
}

export {}
```

In the model, you can add the metadata to the `meta` property:

```ts
const todoModel = defineDataModel({
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
const todoModel = defineDataModel({
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

You can define computed fields in the model. Computed fields are not stored in the cache, but they can be used to derive values from other fields.

For example, you can define a `fullName` computed field that concatenates the `firstName` and `lastName` fields:

```ts
const userModel = defineDataModel({
  name: 'users',
  computed: {
    fullName: item => `${item.firstName} ${item.lastName}`,
  },
})
```

You can then use the computed field in your application just like any other field:

```ts
const store = useStore()

const { data: user } = store.users.queryFirst('some-id')

watchEffect(() => {
  console.log(user.value?.fullName) // This is a computed field
  // => John Doe
})
```

## Schema validation

You can define some default schema validation for your model using the `schema` property. This is useful for validating the data for a create or update operation.

You can specify the schema for the `create` and `update` operations. The schema can be defined using any validation library that implements [Standard Schema](https://standardschema.dev/).

```ts
import { z } from 'zod'

const todoModel = defineDataModel({
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
