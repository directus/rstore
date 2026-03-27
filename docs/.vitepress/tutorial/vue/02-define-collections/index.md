---
title: Define Collections
---

This is where the app stops being a shell and starts becoming an rstore app. Collections are the unit of modeling: they describe what a record looks like, how to identify it, and which operations exist for it.

Open `src/rstore/schema.ts`. The starter file already imports the item types and the in-memory backend. Your job is to turn those pieces into two real collections: one writable `Todo` collection and one readable `User` collection.

```ts
export const TodoCollection = withItemType<Todo>().defineCollection({
  name: 'Todo',
  getKey: item => item.id,
  hooks: {
    fetchFirst: ({ key }) => key ? memoryBackend.get('todos', String(key)) : undefined,
    fetchMany: () => memoryBackend.list('todos'),
  },
})
```

For `TodoCollection`, define the full CRUD surface the app needs: fetch one item, fetch many items, create, update, and delete. For `UserCollection`, only the read hooks matter because users are being used as related records, not editable data.

```ts
export const schema = [
  TodoCollection,
  UserCollection,
] as const
```

That tuple export matters because the store type is inferred from it.

The important thing to notice is that collections are not just fetch wrappers. They are the place where rstore learns record identity, mutations, form helpers, metadata, and later relations. Once the model is clear here, the rest of the API becomes much easier to trust.
