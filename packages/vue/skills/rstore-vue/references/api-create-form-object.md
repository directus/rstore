| name | description |
| --- | --- |
| `api-create-form-object` | Reference for `createFormObject(options)` |

# createFormObject

## Surface

Creates a reactive form object with validation and submit lifecycle.

## Syntax

```ts
const form = createFormObject({
  defaultValues: () => ({ name: '' }),
  submit: async data => data,
})
await form.$submit()
```

## Behavior

- Exposes `$submit`, `$reset`, `$loading`, `$error`, `$valid`, `$changedProps`.
- Exposes `$opLog` (undo/redo, optimized operation access).
- Exposes `$getRaw(field)` for integration code that needs the backing form field without resolving relation facades.
- Exposes `$getRawData({ clone?: boolean })` for integration code that needs public backing form data without internal state.
- Supports collaborative rebasing via `$rebase`, `$conflicts`, and `$resolveConflict`.
- Supports `validateOnSubmit`, `transformData`, `resetOnSuccess`.

## Requirements

- Validation schema must follow Standard Schema v1 contract.

## Pitfalls

1. Deprecated aliases `$save` / `$onSaved` should not be used in new code.
