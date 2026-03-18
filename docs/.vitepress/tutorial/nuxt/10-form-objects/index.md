---
title: Form Objects
---

Forms are where a lot of good data architecture goes to get messy. This chapter keeps that complexity attached to the collection instead of scattering it through a component.

## Swap refs for forms

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

Use `$hasChanges()` for the edit state and you will have a form that can explain itself.

## What this buys you

The component stops being the place where validation rules, dirty tracking, and reset behavior are recreated. The collection schema already knows how a Todo should be edited, so the form object simply exposes that knowledge to the UI.
