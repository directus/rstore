| name | description |
| --- | --- |
| `api-form-rebase` | Reference for form `$rebase(remoteItem, changedFields?)` |

# $rebase

Applies remote data to a form being edited without losing local edits.

## Surface

`form.$rebase(remoteItem, changedFields?)` on form objects.

## Syntax

```ts
form.$rebase(remoteItem)
form.$rebase(remoteItem, ['title', 'body'])
```

## Behavior

- Replaces the form base state with the remote data.
- Replays local operations (`$opLog`) on top of the new base.
- Fields changed both locally and remotely go through `formFieldMerge` handlers (or the form `fieldMerge` option); unmerged ones become `$conflicts` entries.
- `changedFields` lists remotely changed fields explicitly, covering a remote change back to a previous value that a diff cannot detect.

## Requirements

- Register a merger (multiplayer plugin, `formFieldMerge` hook or `fieldMerge`) for automatic merging.

## Pitfalls

1. Without a merger, a field changed on both sides conflicts even when text edits do not overlap.
