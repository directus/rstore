---
title: Query in a Page
---

Your module and collections are doing their job now, so the page can stop faking data and start trusting the store. This chapter is about reading the todo list the Nuxt way: directly inside the page’s setup.

## Replace the placeholder state

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

## What Nuxt adds here

Notice what you did not have to write. There is no manual store bootstrap in this file. The Nuxt module already made `useStore()` available, so the page can stay focused on reading data instead of wiring infrastructure.
