---
title: Form Objects
---

Direct mutations are fine for buttons and tiny handlers. Forms usually need more structure: field state, reset behavior, validation, change detection, loading, and submit lifecycle. The form API keeps that logic attached to the collection instead of rebuilding it in each component.

Open `src/components/TodoForm.vue`. Replace the local refs with one create form and, when `editId` exists, one update form.

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

Use `$hasChanges()` for edit-state logic so the component can describe the UI instead of inventing bookkeeping.

Form objects can also expose relational editing helpers, operation logs, undo/redo behavior, rebasing, and collaboration-aware conflict handling. You do not need all of that for this todo app, but the core idea should still click: the collection can own form behavior just as naturally as it owns mutations.
