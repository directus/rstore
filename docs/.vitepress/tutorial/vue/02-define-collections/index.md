---
title: Define Collections
---

In this chapter you are giving rstore its first real vocabulary: what a Todo is, what a User is, how each record gets a stable key, and which backend hooks should power the collection.

## The Schema

The schema is the heart of rstore. It defines the collections that make up your store, and each collection defines some configuration about each data type of your application and their relationships.

## Build the schema

Open `src/rstore/schema.ts`. The starter file already imports the item types and the in-memory backend, so your job is to turn those ingredients into two working collections.

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

Give `TodoCollection` the full set of hooks used by the rest of the tutorial: load one item, load the list, create, update, and delete. Then give `UserCollection` the read hooks it needs so later chapters can resolve assignees.

```ts
export const schema = [
  TodoCollection,
  UserCollection,
] as const
```

That final export matters. The store and typed helpers are inferred from that schema tuple.

## What to notice

Collections are not just transport configs. They are where record identity, operations, form helpers, and later relations are defined. Once `Todo` and `User` are set up clearly, the rest of the API becomes much easier to use with confidence.
