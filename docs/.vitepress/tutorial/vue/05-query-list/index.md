---
title: Query a List
---

This is the first time the page really reads from rstore instead of from temporary local state. `query()` is the default way to bind UI to store data, and this is the smallest useful version of that pattern.

Open `src/App.vue` and replace the placeholder refs with one query that returns the list, loading state, and refresh function together.

```ts
const store = useStore()
const { data: todos, loading, refresh } = await store.Todo.query(q => q.many())
```

Once the query is in place, the template should stop talking to fake refs and start talking to the query result everywhere.

```vue
<button @click="refresh()">
  Refresh
</button>

<span class="meta-pill">
  {{ loading ? 'Refreshing…' : `${todos.length} todos rendered` }}
</span>
```

The key idea is not just “fetch the list.” It is “let one query own the reading path for this screen.” The list, the loading badge, and the refresh button should all point at the same source of truth.

That stays simple because the query is reading from the normalized cache. Later steps will create, update, delete, and stream items into that cache. The page should not need a second copy of the todo list to keep up.
