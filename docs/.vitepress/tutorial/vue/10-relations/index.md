---
title: Relations
---

Right now a todo only knows `assigneeId`, which is enough to store the link but not enough to express the relationship. rstore still needs the mapping that lets the UI read `todo.assignee?.name` directly.

Open `src/rstore/relations.ts`. Return a real relation definition built from the app’s collections.

```ts
export function defineTodoRelations(
  todoCollection: typeof TodoCollection,
  userCollection: typeof UserCollection,
) {
  return defineRelations(todoCollection, ({ collection }) => ({
    assignee: {
      to: collection(userCollection, {
        on: {
          'User.id': 'Todo.assigneeId',
        },
      }),
    },
  }))
}
```

The important move is the `on` mapping. You are telling rstore which field on the related record corresponds to which field on the current record.

Because both collections live in the normalized cache, the relation can be resolved on the client without a manual lookup map in the component. The UI gets richer data, but the joining logic stays next to the schema where it belongs. Later on, the same relation definitions also power `include` fetching and relational form helpers.
