# Mutation

## Create

To create a new record, you can use the `create` method on the store. This method takes an object with the properties of the record you want to create.

```ts
const newTodo = await store.todos.create({
  title: 'New Todo',
  completed: false,
})
```

::: tip
You can also use the `createForm` method to create a new record. This method returns a form object that you can use to manage the state of the form and submit it when you're ready. See [Forms](./form.md#create-form) for more details.
:::

## Create Many <Badge text="New in v0.7.3" />

You can create many items at once by using the `createMany` method on the store. This method takes an array of objects with the properties of the records you want to create.

```ts
const newTodos = await store.todos.createMany([
  { title: 'New Todo 1', completed: false },
  { title: 'New Todo 2', completed: false },
])
```

It can be useful to batch the create operations into a single fetch request to your backend. See `createMany` in the [plugin hooks](../plugin/hooks.md#createmany).

## Update

To update an existing record, you can use the `update` method on the store. This method takes an object with the properties you want to update and the key of the record you want to update.

```ts
const updatedTodo = await store.todos.update({
  completed: true,
}, {
  key: 'some-id',
})
```

If you don't provide the key, rstore will attempt to compute the key from the object you pass to the `update` method. (See [getKey](../schema/collection.md#item-key) for more details on how to compute the key.)

```ts
const updatedTodo = await store.todos.update({
  id: 'some-id',
  completed: true,
})
```

You can also update the record directly by using the `$update` method on the record itself. This method takes an object with the properties you want to update.

```ts
const todo = await store.todos.findFirst('some-id')

if (todo) {
  await todo.$update({
    completed: true,
  })
}
```

This also works with the reactive `query` and `liveQuery` methods:

```ts
const { data: todo } = await store.todos.query(q => q.first('some-id'))

async function toggle() {
  if (todo.value) {
    await todo.value.$update({
      completed: !todo.value.completed,
    })
  }
}
```

::: tip
You can also use the `updateForm` method to update an existing record. This method returns a form object that you can use to manage the state of the form and submit it when you're ready. See [Forms](./form.md#update-form) for more details.
:::

## Update Many <Badge text="New in v0.7.3" />

You can update many items at once by using the `updateMany` method on the store. This method takes an array of objects with the properties you want to update. Each object must contain the key (or the properties used to [compute the key](../schema/collection.md#item-key)) of the record you want to update.

```ts
const updatedTodos = await store.todos.updateMany([
  { id: 'id-1', completed: true },
  { id: 'id-2', completed: true },
])
```

It can be useful to batch the update operations into a single fetch request to your backend. See `updateMany` in the [plugin hooks](../plugin/hooks.md#updatemany).

## Delete

To delete a record, you can use the `delete` method on the store. This method takes the key of the record you want to delete.

```ts
await store.todos.delete('some-id')
```

You can also pass an object that contains the key of the record you want to delete. (See [getKey](../schema/collection.md#item-key) for more details on how to compute the key.)

```ts
await store.todos.delete({
  id: 'some-id',
})
```

You can also pass an entire record to the `delete` method.

```ts
const todo = await store.todos.findFirst('some-id')

if (todo) {
  await store.todos.delete(todo)
}
```

You can also delete the record directly by using the `$delete` method on the record itself. This method does not take any arguments.

```ts
const todo = await store.todos.findFirst('some-id')

if (todo) {
  await todo.$delete()
}
```

## Delete Many <Badge text="New in v0.7.3" />

You can delete many items at once by using the `deleteMany` method on the store. This method takes an array of keys or objects that contain the keys of the records you want to delete.

```ts
await store.todos.deleteMany(['id-1', 'id-2'])
```

It can be useful to batch the delete operations into a single fetch request to your backend. See `deleteMany` in the [plugin hooks](../plugin/hooks.md#deletemany).

## Custom Mutations <Badge text="New in v0.9" />

Use `mutate` when you need to perform custom remote work that still represents a collection `create`, `update`, or `delete`.

The callback replaces the remote plugin hook for that operation. rstore still owns the mutation lifecycle around it:

- `beforeMutation` / `beforeManyMutation` run before the callback
- the callback receives the hook-final `item`, `items`, `key`, `keys`, `meta`, `store`, and `collection`
- `createItem`, `updateItem`, `deleteItem`, and their many variants are not called
- `afterMutation` / `afterManyMutation` run after a successful callback
- the final result is written to cache and recorded in mutation history

```ts
const selectedFile = fileInput.files?.[0]

if (!selectedFile) {
  throw new Error('No file selected')
}

const uploadedFile = await store.files.mutate({
  mutation: 'create',
  item: {
    filename: selectedFile.name,
    mimeType: selectedFile.type,
  },
}, async ({ item }) => {
  const formData = new FormData()
  formData.set('file', selectedFile)
  formData.set('metadata', JSON.stringify(item))

  const uploadResponse = await fetch('/api/files/upload', {
    method: 'POST',
    body: formData,
  })
  const { id } = await uploadResponse.json()

  const fileResponse = await fetch(`/api/files/${id}`)
  return await fileResponse.json()
})
```

The returned value is the final mutation result. If an `afterMutation` hook calls `setResult`, `mutate` resolves with that updated result and writes it to cache.

::: tip
For `create` and `update`, return the full saved item so rstore can parse it and compute its key before writing to cache.
:::

For cache writes, `create` and `update` need a non-null final result with a key. `delete` needs a `key`, `keys`, `item`, `items`, or result item keys. These cache-key requirements are skipped when `skipCache: true` is set.

If you are working with a resolved collection instead of the generated collection API, use `store.$mutate`:

```ts
const collection = store.$collections.find(c => c.name === 'files')!
const replacementFile = fileInput.files?.[0]

if (!replacementFile) {
  throw new Error('No replacement file selected')
}

const file = await store.$mutate({
  collection,
  mutation: 'update',
  key: 'file-id',
  item: {
    filename: replacementFile.name,
    mimeType: replacementFile.type,
  },
}, async ({ key, item }) => {
  const formData = new FormData()
  formData.set('file', replacementFile)
  formData.set('metadata', JSON.stringify(item))

  const response = await fetch(`/api/files/${key}/replace`, {
    method: 'POST',
    body: formData,
  })
  return await response.json()
})
```

### Many custom mutations

`mutate` uses the many lifecycle when you pass `many: true`, `keys`, or `items`. The callback return value alone does not switch to many mode because rstore needs to know which before hook to call before the callback runs.

```ts
await store.files.mutate({
  mutation: 'delete',
  keys: ['file-id-1', 'file-id-2'],
}, async ({ keys }) => {
  await fetch('/api/files/uploads', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileIds: keys,
    }),
  })
})
```

For many `create` and `update` mutations, return the saved items:

```ts
const files = await store.files.mutate({
  mutation: 'update',
  items: [
    { id: 'file-id-1', folderId: 'receipts' },
    { id: 'file-id-2', folderId: 'receipts' },
  ],
}, async ({ items }) => {
  const response = await fetch('/api/files/bulk-move', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(items),
  })
  return await response.json()
})
```

### Skipping cache writes

Pass `skipCache: true` when the custom mutation should run mutation hooks and record history without writing the callback result to cache.

```ts
const archiveFormData = new FormData()
archiveFormData.set('archive', archiveFile)

await store.files.mutate({
  mutation: 'create',
  skipCache: true,
}, async () => {
  const response = await fetch('/api/files/import-archive', {
    method: 'POST',
    body: archiveFormData,
  })
  return await response.json()
})
```

If the callback throws, rstore does not call after hooks, write to cache, or record mutation history.

::: info
`mutate` does not use optimistic layers or batch scheduling. Use the normal `create`, `update`, and `delete` APIs when you want those features.
:::

## Batching <Badge text="New in v0.9" />

Individual `create` / `update` / `delete` calls that happen in the same tick can also be combined into a single request by a batch-aware plugin, without switching to the `*Many` variants. See [Batching](./batching.md).

## Optimistic Updates <Badge text="New in v0.7" />

By default, rstore will try to perform optimistic updates when you create, update or delete a record. This means that the record will be updated in the store immediately, without waiting for the server to confirm the change. If an error is thrown during the mutation, the change will be automatically reverted.

You can disable optimistic updates by passing the `optimistic: false` option to the mutation method.

```ts
const newTodo = await store.todos.create({
  title: 'New Todo',
  completed: false,
}, {
  optimistic: false,
})
```

```ts
myTodo.$update({
  completed: true,
}, {
  optimistic: false,
})
```

```ts
const editForm = await store.todos.updateForm({
  key: 'my-id',
  optimistic: false,
})
```

You can customize the expected result of the mutation by passing an object to the `optimistic` option. It will be merged with the data you pass to the mutation method but can override it.

```ts
const newTodo = await store.todos.create({
  title: 'New Todo',
  completed: false,
}, {
  optimistic: {
    id: 'temp-id',
    createdAt: new Date().toISOString(),
  },
})

/*
The optimistic object will be:
{
  id: 'temp-id', // added
  title: 'New Todo',
  completed: false,
  createdAt: '2024-06-01T12:00:00.000Z', // added
}
*/
```

To know if a record is optimistic, you can check the `$isOptimistic` property on the record.

```ts
const todo = await store.todos.findFirst('some-id')

if (todo.$isOptimistic) {
  console.log('This record is optimistic')
}
```
