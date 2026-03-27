---
title: Add Server API Routes
---

This makes the backend side of the app visible. rstore is local-first, but it still needs a transport layer to read from and write to something real. In this demo, that “something real” is a tiny in-memory Nuxt API.

If you open the files under `server/api/todos`, you can see the route handlers are intentionally thin. Each one hands off to shared helpers instead of inventing its own business logic.

```ts
export default defineEventHandler(() => {
  return listTodos()
})
```

For item lookups and mutations, the pattern is the same: read ids from the route, parse the body when needed, and delegate to `server/utils/tutorial-data.ts`.

The bigger lesson is structural. Collections and plugins describe how rstore talks to a backend, but there still has to be a backend shape on the other side. Keeping that backend tiny keeps the learning focused on rstore without pretending the transport layer does not exist.
