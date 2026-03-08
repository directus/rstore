| name | description |
| --- | --- |
| `api-create-form` | Reference for collection `createForm(formOptions?)` |

# createForm

## Surface

Builds form object bound to collection create mutation.

## Syntax

```ts
const form = store.todos.createForm()
form.title = 'Task'
await form.$submit()
```

## Behavior

- Uses collection create schema by default.
- Provides change tracking and submit lifecycle APIs.

## Requirements

- Override schema/options when collection defaults are not sufficient.

## Pitfalls

1. Skipping form APIs in UI flows usually duplicates validation/loading state logic.
