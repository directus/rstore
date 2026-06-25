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
- Supports `$getRaw(field)` for reading backing form values without invoking relation facades.
- Supports `$getRawData({ clone?: boolean })` for exporting public backing form data.

## Requirements

- Override schema/options when collection defaults are not sufficient.

## Pitfalls

1. Skipping form APIs in UI flows usually duplicates validation/loading state logic.
