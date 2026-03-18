---
title: Welcome
---

You are about to build a small todo app while learning the core rstore workflow. Each chapter gives you a real Vue sandbox, a preview, and a validation check, and the point is to do the implementation yourself rather than fill in one tiny gap.

## Start here

Take one minute to get comfortable with the layout. The editor is where you work, the preview is the running app, and validation is the quick check that the current chapter is really implemented.

```ts
const store = useStore()
const { data: todos } = await store.Todo.query(q => q.many())
```

That pattern is where we are headed. By the end of the track, you will know what had to be defined so a line like that feels natural.

## How to use the tutorial

Treat each chapter like a guided exercise, not a scavenger hunt. Read the guide first, glance at the starter file, then implement the idea in your own words. If you get stuck, validate early. The correction view is there to unblock you, not to punish experimentation.

## What You Will Practice

rstore is local-first and schema-driven. You define what your records look like, how to identify them, and how they travel to and from a backend. Once that foundation is in place, queries, mutations, forms, relations, and cache APIs all build on the same model.
