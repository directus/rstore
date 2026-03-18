---
title: Form Objects
---

Up to now you have been driving mutations directly. That is useful, but forms usually need more help: field state, validation, submit behavior, change detection, and reset behavior. rstore can bundle that up for you.

## Convert the component to form objects

Open `src/components/TodoForm.vue`. Start by replacing the local refs with one create form and, when `editId` exists, one update form.

```ts
const store = useStore()
const createTodo = store.Todo.createForm()
const updateTodo = props.editId ? await store.Todo.updateForm(props.editId) : null
```

Then bind the template directly to those form objects.

```vue
<input v-model="createTodo.text">
<button :disabled="!createTodo.$valid" @click="createTodo.$submit()">
  Save
</button>

<button class="secondary" @click="updateTodo.$reset()">
  Reset
</button>
```

If you also use `$hasChanges()` for the edit state, the component will stop inventing its own bookkeeping.

## Why This Helps

Form objects keep mutation rules close to the collection schema. That means validation, defaults, submit behavior, and reset behavior all come from the same source of truth. Your component becomes a view over the form, not the place where business rules are reconstructed.
