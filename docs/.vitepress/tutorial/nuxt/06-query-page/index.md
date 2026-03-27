---
title: Query in a Page
---

The module and collections are doing their job now, so the page can stop faking data and start trusting the store. This is the simplest useful example of querying where the data is actually needed, expressed in Nuxt page setup.

Open `app/pages/index.vue` and grab the injected store.

```ts
const store = useStore()
const { data: todos, loading, refresh } = await store.Todo.query(q => q.many())
```

Once you have that query result, the rest of the page should hang off it: the list, the loading label, and the refresh button.

```vue
<button @click="refresh()">
  Refresh
</button>

<span class="meta-pill">
  {{ loading ? 'Refreshing…' : `${todos.length} todos rendered` }}
</span>
```

The interesting part is what this file does not need. There is no hand-written store bootstrap and no local mirror of the todo list. The page describes how it wants to read data, and the Nuxt module plus the normalized cache take care of the infrastructure underneath.
