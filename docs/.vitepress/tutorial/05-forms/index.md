---
title: Form Objects
---

rstore can manage form state for you instead of making every component juggle refs, dirty state, validation, and submit/reset logic by hand.

## What you are editing

Edit `src/components/TodoForm.vue`. The schema already defines a `formSchema`, which is why form helpers are available on the Todo collection in this step.

## What is missing

The component still uses local refs for both the create form and the edit form, so none of the rstore form helpers are active.

## Step by step

1. Import `useStore` from `@rstore/vue` and create the store with `useStore()`.
2. Replace the create-side refs with `const createTodo = store.Todo.createForm()`.
3. Create the edit form with `await store.Todo.updateForm(props.editId)` when `editId` exists.
4. Report state from the form objects: `createTodo.$valid` for create validation and `updateTodo?.$hasChanges()` for edit dirty state.
5. Bind the inputs directly to the form objects, for example `v-model="createTodo.text"`.
6. Submit with `await createTodo.$submit()` and `await updateTodo.$submit()`.
7. Use `updateTodo.$reset()` for the reset button so the form returns to its loaded values.

## Why this matters

Form objects keep validation and submission close to the collection definition, which makes forms consistent across components. You can ask the form if it is valid, if it has changes, and tell it to submit or reset without re-implementing those rules locally.

## Check your work

The smoke test expects all of these to work: create a new todo, detect edit changes, reset the edit form, then submit an update. If one part fails, inspect the corresponding form object method.
