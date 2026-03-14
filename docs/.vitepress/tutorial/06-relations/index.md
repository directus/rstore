---
title: Relations
---

Until now a todo only knew its `assigneeId`. In this step you teach rstore how to resolve the related User record so the UI can read `todo.assignee?.name`.

## What you are editing

Edit `src/rstore/relations.ts`. The app already preloads users and renders the assignee name if the relation exists.

## What is missing

`defineTodoRelations(...)` currently returns `undefined`, so the store has no relation mapping between Todo and User.

## Step by step

1. Import `defineRelations` from `@rstore/vue`.
2. Accept the real `todoCollection` and `userCollection` arguments instead of unused placeholders.
3. Return `defineRelations(todoCollection, ({ collection }) => ({ ... }))`.
4. Inside the relation object, define an `assignee` relation.
5. Point that relation to the User collection with `collection(userCollection, { on: { 'User.id': 'Todo.assigneeId' } })`.

## Why this matters

Relations let rstore join normalized records on the client. Because users are already in the cache, the todo list can resolve each assignee immediately without adding a separate manual lookup in the component.

## Check your work

At least one todo should show a real assignee name instead of the fallback text. If not, double-check both sides of the `on` mapping.
