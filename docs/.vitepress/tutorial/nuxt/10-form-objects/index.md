---
title: Form Objects
---

Forms are where a lot of otherwise good state architecture turns into ad hoc refs, duplicated validation, and manual reset logic. The form API keeps that behavior attached to the collection, where the rest of the data rules already live.

Open `app/components/TodoForm.vue`. Replace the local refs with the form helpers exposed by the Todo collection.

```ts
const store = useStore()
const createTodo = store.Todo.createForm()
const updateTodo = props.editId ? await store.Todo.updateForm(props.editId) : null
```

Then bind the template to those objects instead of to loose refs.

```vue
<input v-model="createTodo.text">

<button :disabled="!createTodo.$valid" @click="createTodo.$submit()">
  Save
</button>

<button class="secondary" @click="updateTodo.$reset()">
  Reset
</button>
```

Use `$hasChanges()` for the edit state and the component can describe UI intent instead of maintaining a pile of bookkeeping.

Form objects can also expose relational editing, operation logs, undo/redo, rebasing, and collaboration-oriented behavior. You do not need all of that for this todo app, but the core idea should still feel concrete: a collection can own form behavior just as naturally as it owns queries and mutations.
