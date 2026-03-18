---
title: Relations
---

So far the page knows each todo’s `assigneeId`, but that is still raw data. In this chapter you define how a Todo points at a User so the page can ask for richer information.

## Define the relation

Open `app/rstore/relations.ts` and connect the Todo collection to the User collection.

```ts
export default RStoreSchema.defineRelations(todoCollection, ({ collection }) => ({
  assignee: collection(userCollection, {
    on: {
      'User.id': 'Todo.assigneeId',
    },
  }),
}))
```

The `on` mapping is the whole lesson here. It tells rstore which field on the related record lines up with which field on the current record.

## Why the page gets simpler

Once the relation exists, your components can ask for `todo.assignee?.name` without building a separate user lookup map. The normalized cache already has the pieces. The relation definition tells rstore how those pieces fit together.
