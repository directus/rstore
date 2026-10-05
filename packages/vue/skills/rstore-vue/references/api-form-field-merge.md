| name | description |
| --- | --- |
| `api-form-field-merge` | Reference for the `formFieldMerge` plugin hook |

# formFieldMerge

Merge policy for form fields changed both locally and remotely during `$rebase()`.

## Surface

`hook('formFieldMerge', payload => void)` inside `definePlugin({ setup })`.

## Syntax

```ts
hook('formFieldMerge', ({ collection, field, base, local, remote, setMerged }) => {
  if (typeof base === 'number' && typeof local === 'number' && typeof remote === 'number') {
    // Counters: apply both deltas
    setMerged(local + remote - base)
  }
})
```

## Behavior

- Called for every field changed both locally and remotely, then for each local `set` operation of that field, so the op log is rewritten and undo/redo replay merged values.
- First handler that calls `setMerged` wins.
- Without any handler calling `setMerged`, the field becomes a `$conflicts` entry.
- The multiplayer plugin registers a text merger on this hook (see the `rstore-multiplayer` skill).

## Requirements

- Applies to store forms (`createForm` / `updateForm`); standalone `createFormObject` forms take `fieldMerge` instead.

## Pitfalls

1. Since v0.9 there is no default merge policy: non-overlapping text edits conflict unless a merger is registered.
