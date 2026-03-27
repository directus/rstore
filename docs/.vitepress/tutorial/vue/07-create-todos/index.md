---
title: Create Todos
---

The page can read from the store now, so the next step is to issue intents back into it. This is about using the collection mutation API while letting the same query-driven UI stay in charge of rendering.

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

You can clear the input after create, but you should not need to splice arrays, refetch manually, or keep your own mirrored list in sync. The query should react because mutations update the normalized cache underneath it.

That is the local-first payoff. The component owns intent. rstore owns synchronization.
