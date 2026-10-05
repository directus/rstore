| name | description |
| --- | --- |
| `api-form-field-conflict` | Reference for `FormFieldConflict` entries of `form.$conflicts` |

# FormFieldConflict

Unresolved field conflict produced by form `$rebase()`.

## Surface

`form.$conflicts: FormFieldConflict[]`, with `form.$onConflict(cb)` and `form.$resolveConflict(field, 'local' | 'remote')`.

## Syntax

```ts
form.$onConflict((conflicts) => {
  console.log('Conflicts:', conflicts)
})

for (const conflict of form.$conflicts) {
  if (conflict.field === 'title') {
    form.$resolveConflict('title', 'remote')
  }
}
```

## Behavior

- Entry shape: `{ field, localValue, remoteValue }`.
- `$resolveConflict(field, 'local')` keeps local edits.
- `$resolveConflict(field, 'remote')` drops local operations for that field and accepts the rebased value.

## Requirements

- Conflicts exist only for fields no merger resolved.

## Pitfalls

1. `localTimestamp` / `remoteTimestamp` were removed in v0.9; do not read them.
