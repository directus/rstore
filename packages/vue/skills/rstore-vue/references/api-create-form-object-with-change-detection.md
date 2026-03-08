| name | description |
| --- | --- |
| `api-create-form-object-with-change-detection` | Reference for `createFormObjectWithChangeDetection(...)` |

# createFormObjectWithChangeDetection

## Surface

Deprecated alias for `createFormObject(...)`.

## Syntax

```ts
const form = createFormObjectWithChangeDetection({
  submit: async data => data,
})
```

## Behavior

- Logs a deprecation warning.
- Delegates to `createFormObject(...)` with the same arguments.

## Requirements

- Prefer `createFormObject(...)` directly for new code.

## Pitfalls

1. Keeping this alias in new code bakes in deprecated API usage.
