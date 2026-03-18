---
title: Create Todos
---

Now the page needs to do more than read. In this chapter you will make the list feel interactive by wiring create, toggle, and delete operations through the store.

## Finish the page actions

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

You should only be issuing data operations here. Let the query react instead of manually rebuilding the list.

## Why the page stays lightweight

This is the same local-first idea you saw in Vue, now with Nuxt’s generated store. The page owns intent, not synchronization. The normalized state lives in rstore, so the page can stay pleasantly boring even after it handles three different mutations.
