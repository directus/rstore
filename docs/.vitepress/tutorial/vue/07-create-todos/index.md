---
title: Create Todos
---

The page can read data now. Time to make it feel alive. In this chapter you will finish the everyday CRUD loop: add a todo, toggle one, and delete one, all from the same query-driven view.

## Teach the page its actions

Open `src/App.vue` and implement the three handlers the template already calls.

```ts
async function addTodo(text: string) {
  const value = text.trim()

  if (!value) {
    return
  }

  await store.Todo.create({
    text: value,
    completed: false,
    assigneeId: 'user-1',
  })
}
```

Then wire each row so it can update itself and remove itself.

```ts
const todo = todos.value.find(item => item.id === id)
await todo.$update({ completed: !todo.completed })
await store.Todo.delete(id)
```

You can clear the input after create, but you should not need to manually splice arrays or rebuild the list. Let the query react.

## Why the page stays simple

This is the payoff of letting rstore own the data layer. The page issues intents like “create this todo” or “toggle that item,” and the cache keeps the rendered list honest. The UI stays small because it is not pretending to be a database.
