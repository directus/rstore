---
title: Mutation
---

Reading data is only half of the story. In this step you will create, update, and delete Todo records through the collection API.

## What you are editing

Edit `src/App.vue`. The list query is already in place and the template already calls the three handler functions.

## What is missing

`addTodo`, `toggleTodo`, and `removeTodo` are still placeholders, so the built-in smoke test cannot exercise any real mutations.

## Step by step

1. In `addTodo`, trim the incoming text and stop early if it is empty.
2. Create a record with `await store.Todo.create(...)`. Include `text`, `completed: false`, and a valid `assigneeId` such as `'user-1'`.
3. After creation, mark `mutationState.value.created = true` and clear the input.
4. In `toggleTodo`, find the matching todo in `todos.value`.
5. Call `await todo.$update({ completed: !todo.completed })` on that record, then mark `toggled` as true.
6. In `removeTodo`, call `await store.Todo.delete(id)` and mark `deleted` as true.

## Why this matters

The collection API keeps the normalized cache updated for you. That means the UI list changes immediately after each mutation, without you manually patching the array.

## Check your work

The smoke test will create a todo, toggle it, and delete it again. If one part fails, focus on the matching handler in `App.vue`.
