---
title: Relations
---

So far the page knows each todo’s `assigneeId`, but that is still just a foreign key. rstore still needs the relation mapping that lets the page ask for richer data.

Open `app/rstore/relations.ts` and connect the Todo collection to the User collection.

```ts
export default RStoreSchema.defineRelations(todoCollection, ({ collection }) => ({
  assignee: {
    to: collection(userCollection, {
      on: {
        'User.id': 'Todo.assigneeId',
      },
    }),
  },
}))
```

The `on` mapping is the key idea. It tells rstore which field on the related record lines up with which field on the current record.

Once the relation exists, your components can ask for `todo.assignee?.name` without building a separate lookup map. The normalized cache already has the pieces. The relation definition tells rstore how those pieces fit together, and the same mapping later informs include fetching and relational form behavior.
