---
title: Relations
---

Right now a todo only knows an `assigneeId`. In this chapter you will define how a todo points at a user so the UI can read `todo.assignee?.name` directly.

## Map the relation

Open `src/rstore/relations.ts`. You want to return a relation definition from the real collections, not from placeholder parameters.

```ts
export function defineTodoRelations(
  todoCollection: typeof TodoCollection,
  userCollection: typeof UserCollection,
) {
  return defineRelations(todoCollection, ({ collection }) => ({
    assignee: collection(userCollection, {
      on: {
        'User.id': 'Todo.assigneeId',
      },
    }),
  }))
}
```

The key idea is the `on` mapping. You are telling rstore which field on the related record matches which field on the current record.

## Why this is powerful

Because both collections already live in the normalized cache, rstore can resolve the relation on the client without you building manual lookup maps in the component. The page gets joined data, but the join logic stays where it belongs: next to the schema.
