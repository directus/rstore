# Form Objects

## Create

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

## Relational Editing

When a collection has [relations](../schema/relations.md) defined, form objects automatically expose special methods on each relation field to manage related items. These methods record `connect`, `disconnect`, and `set` operations in the [operation log](#operation-log) so that plugins can process them on submit.

### Relation methods

For each relation defined on the collection, the form object provides a relation field with three methods:

| Method | Description |
|---|---|
| `connect(item)` | Connect a related item. |
| `disconnect(item?)` | Disconnect a specific related item (many-relations), or the current item (one-to-one). Calling without arguments on a many-relation disconnects **all** items. |
| `set(items)` | Replace all related items at once (many-relations), or connect/disconnect a single item (one-to-one). |
| `value` | The current resolved value of the relation. For one-to-one relations this is the related item or `null`. For many-relations this is an array. |

### One-to-one relations

For one-to-one relations, `connect` automatically sets the foreign key field(s) on the form, and `disconnect` clears them.

```ts
// Given a User collection with a 'profile' one-to-one relation:
// defineRelations(userCollection, ({ collection }) => ({
//   profile: {
//     to: collection(profileCollection, {
//       on: { 'Profile.id': 'User.profileId' },
//     }),
//   },
// }))

const form = store.User.createForm()

// Connect a profile — sets form.profileId automatically
form.profile.connect({ id: 'profile-123' })
console.log(form.profileId) // 'profile-123'

// Access the resolved related item
console.log(form.profile.value) // { id: 'profile-123', ... } (resolved from cache)

// Disconnect the profile — clears form.profileId
form.profile.disconnect()
console.log(form.profileId) // null
console.log(form.profile.value) // null
```

For relations with multiple foreign key fields, all mapped fields are set or cleared:

```ts
// Relation with multiple fields:
// on: { 'OtherThing.type': 'Thing.relatedType', 'OtherThing.id': 'Thing.relatedId' }

form.related.connect({ type: 'TypeA', id: 'item-123' })
console.log(form.relatedType) // 'TypeA'
console.log(form.relatedId) // 'item-123'
```

### Many-relations

For many-relations (one-to-many), connected items are stored internally and tracked via the operation log.

```ts
// Given a User collection with a 'posts' one-to-many relation:
// defineRelations(userCollection, ({ collection }) => ({
//   posts: {
//     to: collection(postCollection, {
//       on: { 'Post.authorId': 'User.id' },
//     }),
//     many: true,
//   },
// }))

const form = store.User.createForm()

// Connect items
form.posts.connect({ id: 'post-1', title: 'First Post' })
form.posts.connect({ id: 'post-2', title: 'Second Post' })

// Access the current list of related items
console.log(form.posts.value) // [{ id: 'post-1', ... }, { id: 'post-2', ... }]

// Disconnect a specific item (matched by property)
form.posts.disconnect({ id: 'post-1' })
console.log(form.posts.value) // [{ id: 'post-2', ... }]

// Disconnect all items
form.posts.disconnect()

// Replace all items at once
form.posts.set([
  { id: 'post-3', title: 'Third Post' },
  { id: 'post-4', title: 'Fourth Post' },
])
```

### Handling relation operations on submit

Relation operations are recorded as `connect`, `disconnect`, and `set` entries in the operation log. When the form is submitted, the optimized operations are passed to the `submit` callback (or to plugin hooks) via `formOperations`, so your backend logic can handle the relational edits:

```ts
const form = store.User.createForm({
  submit: async (data, { formOperations }) => {
    // Create the user first
    const user = await $fetch('/api/users', {
      method: 'POST',
      body: data,
    })

    // Then process relational edits
    for (const op of formOperations) {
      if (op.type === 'connect') {
        await $fetch(`/api/users/${user.id}/relations/${String(op.field)}`, {
          method: 'POST',
          body: op.newValue,
        })
      }
      else if (op.type === 'disconnect') {
        await $fetch(`/api/users/${user.id}/relations/${String(op.field)}`, {
          method: 'DELETE',
          body: op.oldValue,
        })
      }
    }

    return user
  },
})
```

::: tip
The `formOperations` array is automatically [optimized](#optimized-operations) before being passed to the callback — redundant connect/disconnect pairs are cancelled out and only the last `set` per field is kept.
:::

### Full example

```vue
<script lang="ts" setup>
const store = useStore()
const form = store.User.createForm()
const postTitle = ref('')

function addPost() {
  if (postTitle.value) {
    form.posts.connect({ title: postTitle.value })
    postTitle.value = ''
  }
}
</script>

<template>
  <form @submit.prevent="form.$submit()">
    <input v-model="form.name" placeholder="User name">

    <!-- One-to-one: Select a profile -->
    <select @change="form.profile.connect({ id: $event.target.value })">
      <option value="">
        No profile
      </option>
      <option value="profile-1">
        Profile 1
      </option>
      <option value="profile-2">
        Profile 2
      </option>
    </select>

    <!-- Many-relation: Add posts -->
    <input v-model="postTitle" placeholder="Post title">
    <button type="button" @click="addPost">
      Add Post
    </button>

    <!-- Display connected posts -->
    <ul>
      <li v-for="post in form.posts.value" :key="post.id">
        {{ post.title }}
      </li>
    </ul>

    <button type="submit" :disabled="form.$loading">
      Create User
    </button>
  </form>
</template>
```

## Schema Validation

Both `createForm` and `updateForm` methods will by default validate the data using the collection's schemas [see more info here](../schema/collection.md#schema-validation). You can override the schema by passing a new schema to the form object:

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

## Operation Log

Every form object maintains an **operation log** (`$opLog`) that records all changes made to the form — including field edits and relation operations (connect/disconnect). This provides a full change history with undo/redo support, time-travel, and fine-grained querying capabilities.

### Operation structure

Each operation in the log has the following shape:

```ts
interface FormOperation {
  /** Timestamp when the operation was recorded */
  timestamp: number
  /** Field name that was changed */
  field: string
  /** Type of operation: 'set', 'connect', or 'disconnect' */
  type: 'set' | 'connect' | 'disconnect'
  /** New value of the field */
  newValue: any
  /** Previous value of the field */
  oldValue: any
}
```

Operation types:
- **`set`**: A regular field value change, or replacing all items in a many-relation via `$set`.
- **`connect`**: Connecting a related item (relation fields only).
- **`disconnect`**: Disconnecting a related item (relation fields only).

### Accessing the log

Operations are recorded automatically when you modify any field on the form object:

```ts
const form = store.todos.createForm({
  defaultValues: () => ({ title: 'My Todo', completed: false }),
})

form.title = 'Updated Title'
form.completed = true

const ops = form.$opLog.getAll()
// [
//   { field: 'title', type: 'set', newValue: 'Updated Title', oldValue: 'My Todo', timestamp: ... },
//   { field: 'completed', type: 'set', newValue: true, oldValue: false, timestamp: ... },
// ]
```

### Querying operations

The `$opLog` API provides several methods to query the change history:

```ts
// Get all operations for a specific field
const titleOps = form.$opLog.getFieldOps('title')

// Get the most recent operation for a field
const lastTitleOp = form.$opLog.getLastFieldOp('title')

// Check if a field has been changed
if (form.$opLog.hasFieldChanged('title')) {
  // ...
}

// Filter operations with a custom predicate
const stringOps = form.$opLog.getOpsBy(
  op => typeof op.newValue === 'string',
)

// Get operations within a time range
const recentOps = form.$opLog.getOpsInRange(startTime, endTime)
```

### Optimized operations

When submitting the form, the op log is automatically **optimized** before being passed to the `submit` callback. The optimization removes redundant operations:

- **Scalar fields**: Only the last `set` per field is kept.
- **Relation fields**: Matching `connect`/`disconnect` pairs on the same item cancel out.
- A `disconnect`-all removes all prior connect/disconnect operations on that field.
- A `$set` on a relation removes all prior operations on that field.

You can also retrieve the optimized log manually:

```ts
const optimized = form.$opLog.getOptimized()
```

The optimized operations are available in the `submit` callback via the `context` parameter:

```ts
const form = store.todos.createForm({
  submit: async (data, { formOperations }) => {
    // formOperations contains the optimized op log
    console.log(formOperations)
  },
})
```

### Undo and Redo

The op log supports undo and redo. When you undo, the last operation is removed and the form state is rebuilt from scratch by replaying all remaining operations on top of the initial values.

```ts
form.title = 'First'
form.title = 'Second'

form.$opLog.undo() // title is now 'First'
form.$opLog.undo() // title is back to the initial value

form.$opLog.redo() // title is 'First' again
form.$opLog.redo() // title is 'Second' again
```

Use `canUndo` and `canRedo` to check whether undo/redo is available:

```vue
<template>
  <button :disabled="!form.$opLog.canUndo" @click="form.$opLog.undo()">
    Undo
  </button>
  <button :disabled="!form.$opLog.canRedo" @click="form.$opLog.redo()">
    Redo
  </button>
</template>
```

::: warning
Performing a new edit after an undo clears the redo stack — the undone operations are lost.
:::

### Time travel

You can compute a snapshot of the form state at any point in the operation history using `stateAt`:

```ts
form.title = 'First'
form.title = 'Second'
form.title = 'Third'

// Index 0 = initial state (before any operations)
form.$opLog.stateAt(0) // { title: 'Initial' }

// Index 1 = state after the first operation
form.$opLog.stateAt(1) // { title: 'First' }

// Index 2 = state after the second operation
form.$opLog.stateAt(2) // { title: 'Second' }

// Index 3 = current state
form.$opLog.stateAt(3) // { title: 'Third' }
```

### Clearing the log

You can clear the operation log, the redo stack, and the changed props at any time:

```ts
form.$opLog.clear()
```

The log is also automatically cleared when:
- `$reset()` is called.
- `$submit()` succeeds (when `resetOnSuccess` is `true`, which is the default).

### API Reference

| Method / Property | Description |
|---|---|
| `getAll()` | Returns a copy of all recorded operations. |
| `getOptimized()` | Returns an optimized copy with redundant operations removed. |
| `getFieldOps(field)` | Returns operations for a specific field. |
| `getOpsBy(filter)` | Returns operations matching a custom predicate. |
| `getLastFieldOp(field)` | Returns the most recent operation for a field. |
| `hasFieldChanged(field)` | Returns `true` if the field has been modified. |
| `getOpsInRange(start, end)` | Returns operations within a timestamp range. |
| `clear()` | Clears the log, redo stack, and changed props. |
| `undo()` | Undoes the last operation. Returns `true` if successful. |
| `redo()` | Redoes the last undone operation. Returns `true` if successful. |
| `canUndo` | `true` if there are operations that can be undone. |
| `canRedo` | `true` if there are operations that can be redone. |
| `stateAt(index)` | Returns the projected state after `index` operations. |
