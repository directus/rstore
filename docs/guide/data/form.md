# Form Objects

## Create Form

Instead of creating a new item directly, you can create a *form object* that is very useful to handle the data of a form with the `createForm` method.

```ts
const createTodo = store.todos.createForm()
```

The form object is a reactive object that contains the data of the form. You can use it to bind the data to your form inputs.

```vue
<template>
  <input v-model="createTodo.title">
</template>
```

It has several special properties:

- `$reset()`: a method that resets the form to its initial state.
- `$submit()`: a method that saves the form and creates a new item.
- `$loading`: a boolean that indicates whether the form is being saved.
- `$error`: an error object that contains the error if the form could not be saved.
- `$schema` the validation schema for the form object (see [schema validation](#schema-validation)).
- `$onSuccess(cb)`: a method that registers a callback to be called when the form is saved.

Example:

```vue
<script setup>
const store = useStore()
const createTodo = store.todos.createForm()
const input = useTemplateRef('input')
createTodo.$onSuccess(() => {
  input.value.focus()
  input.value.select()
})
</script>

<template>
  <form @submit.prevent="createTodo.$submit()">
    <!-- Input -->
    <input ref="input" v-model="createTodo.title">
    <!-- Submit -->
    <button :disabled="createTodo.$loading">
      Create
    </button>
    <!-- Error -->
    <p v-if="createTodo.$error">
      {{ createTodo.$error.message }}
    </p>
  </form>
</template>
```

You can also call the form object to submit it:

```ts
const createTodo = store.todos.createForm()
createTodo.title = 'My new todo'
const todo = await createTodo()
```

## Update Form

You can also create a form object to update an existing item with the `updateForm` method.

```ts
const updateTodo = await store.todos.updateForm('some-key')
```

You can use any options from `findFirst` to find the item you want to update.

```ts
const updateTodo = await store.todos.updateForm({
  filter: item => item.title === 'some-title',
  params: {
    title: 'some-title',
  },
})
```

::: tip
Contrary to `createForm`, the `updateForm` method returns a promise that resolves to the form object, because it uses `findFirst` to find the item to update. This means that you don't need to fetch the item before to pre-populate the form.
:::

The update for object has the following special properties:

- `$reset()`: a method that resets the form to its initial state.

- `$submit()`: a method that saves the form and updates the item.

- `$loading`: a boolean that indicates whether the form is being saved.

- `$error`: an error object that contains the error if the form could not be saved.

- `$schema` the validation schema for the form object (see [schema validation](#schema-validation)).

- `$hasChanges()` a method that returns a boolean that indicates whether the form has changes.

- `$changedProps`: an object that contains the properties that have changed, in the form of a map of the changed properties with an array containing the new and old values:

  `{ [propertyName]: [newValue, oldValue] }`

- `$onSuccess(cb)`: a method that registers a callback to be called when the form is saved.

Example:

```vue
<script lang="ts" setup>
const props = defineProps<{
  id: string
}>()

const emit = defineEmits<{
  close: []
}>()

const store = useStore()

const updateTodo = await store.Todo.updateForm(props.id)
updateTodo.$onSuccess(() => emit('close'))
</script>

<template>
  <form @submit.prevent="updateTodo.$submit()">
    <!-- Input -->
    <input v-model="updateTodo.title">
    <!-- Submit -->
    <button :disabled="updateTodo.$loading">
      Update
    </button>
    <!-- Error -->
    <p v-if="updateTodo.$error">
      {{ updateTodo.$error.message }}
    </p>
  </form>
</template>
```

## Schema Validation

Both `createForm` and `updateForm` methods will by default validate the data using the model's schemas [see more info here](../model/model.md#schema-validation). You can override the schema by passing a new schema to the form object:

```ts
import { z } from 'zod'

const createTodo = store.todos.createForm({
  schema: z.object({
    title: z.string().min(1),
    completed: z.boolean(),
  }),
})
```

Update form can also accepts a schema in the **second** argument:

```ts
const updateTodo = await store.todos.updateForm('some-key', {
  schema: z.object({
    title: z.string().min(1),
    completed: z.boolean(),
  }),
})
```

::: tip
The schema must be compatible with [Standard Schema](https://standardschema.dev/).
:::

Here is an example with the `UForm` component from [Nuxt UI](https://ui.nuxt.com/) that directly uses the validation schema:

```vue
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
