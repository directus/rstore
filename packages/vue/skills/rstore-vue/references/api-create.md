| name | description |
| --- | --- |
| `api-create` | Reference for collection `create(item, options?)` |

# create

## Surface

Creates one item through mutation pipeline.

## Syntax

```ts
await store.todos.create({ title: 'New' })
```

## Behavior

- Runs plugin mutation hooks.
- Updates cache with mutation result.
- Accepts `options.formOperations` for advanced plugin-driven relation workflows.

## Requirements

- Item payload must satisfy collection create schema/logic.

## Pitfalls

1. Prefer `createForm` for UI form flows needing validation state.
