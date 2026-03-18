---
title: Add Server API Routes
---

This chapter is not part of the interactive track flow right now, but it still tells an important story: rstore needs something real to talk to, even in a tiny tutorial app. Here you wire the Nuxt server routes that power the rest of the demo.

## Restore the route handlers

Open the files under `server/api/todos`. Each route should forward to the shared tutorial data helpers instead of inventing its own logic.

```ts
export default defineEventHandler(() => {
  return listTodos()
})
```

For item lookups and mutations, keep the route handlers thin. Read ids from the route, parse the body when needed, and hand off to the utility functions in `server/utils/tutorial-data.ts`.

## Why this chapter exists

The tutorial uses a tiny in-memory backend so you can practice real fetch, create, update, and delete flows without bringing in a database. That keeps the learning focused on rstore while still showing the shape of a real Nuxt app.
