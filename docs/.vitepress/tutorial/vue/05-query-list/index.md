---
title: Query a List
---

This is the first chapter where the page really starts trusting rstore. Instead of pretending to have todo data with local refs, you are going to ask the store for the list and let that query drive the UI.

## Turn the page into a real query

Open `src/App.vue`. Replace the placeholder refs with a store query that returns the list, the loading state, and the refresh function in one shot.

```ts
const store = useStore()
const { data: todos, loading, refresh } = await store.Todo.query(q => q.many())
```

Once you have that, the template should stop talking to your fake refs and start talking to the query result instead.

```vue
<button @click="refresh()">
  Refresh
</button>

<span class="meta-pill">
  {{ loading ? 'Refreshing…' : `${todos.length} todos rendered` }}
</span>
```

If you wire both the toolbar and the list to the query, the whole page becomes one consistent read of store state.

## Why This Stays Simple

The query result is reactive because it is backed by the normalized cache. Later chapters will create, update, delete, and stream records into that cache. When they do, this page should stay fresh without maintaining a second copy of the todo list by hand.
