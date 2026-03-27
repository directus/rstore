---
title: Create Todos
---

The page can read from the store now, so the next step is to issue mutations back into it. Mutations change store state rather than patching the UI by hand, and that distinction starts paying off here.

Open `app/pages/index.vue` and start with the create handler.

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

Then wire each todo row so it can update and delete itself.

```ts
const todo = todos.value.find(item => item.id === id)
await todo.$update({ completed: !todo.completed })
await store.Todo.delete(id)
```

The page should only be issuing data operations here. Let the query react instead of rebuilding arrays by hand or forcing a full reload.

This is the same local-first idea, just with Nuxt’s generated store. The page owns intent. rstore owns synchronization.
