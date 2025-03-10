# Mutation

## Create

To create a new record, you can use the `create` method on the store. This method takes an object with the properties of the record you want to create.

```ts
const newTodo = await store.todos.create({
  title: 'New Todo',
  completed: false,
})
```

## Update

To update an existing record, you can use the `update` method on the store. This method takes an object with the properties you want to update and the key of the record you want to update.

```ts
const updatedTodo = await store.todos.update({
  completed: true,
}, {
  key: 'some-id',
})
```

If you don't provide the key, rstore will attempt to compute the key from the object you pass to the `update` method. (See [getKey](../model/model.md#item-key) for more details on how to compute the key.)

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

This also works with the reactive `queryFirst` and `queryMany` methods:

```ts
const { data: todo } = await store.todos.queryFirst('some-id')

async function toggle() {
  if (todo.value) {
    await todo.value.$update({
      completed: !todo.value.completed,
    })
  }
}
```

## Delete

To delete a record, you can use the `delete` method on the store. This method takes the key of the record you want to delete.

```ts
await store.todos.delete('some-id')
```

You can also pass an object that contains the key of the record you want to delete. (See [getKey](../model/model.md#item-key) for more details on how to compute the key.)

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
