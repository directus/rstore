| name | description |
| --- | --- |
| `api-option-conflict-policy` | Reference for `createMultiplayerPlugin({ lww: { conflictPolicy } })` |

# lww.conflictPolicy

Decides what happens when a field is written with the same stamp but a different value.

## Surface

`conflictPolicy: 'lww' | 'local-wins' | 'remote-wins' | (context) => 'local' | 'remote' | { value } | undefined`.

## Syntax

```ts
createMultiplayerPlugin({
  lww: {
    conflictPolicy: ({ collection, key, conflict }) => {
      if (conflict.field === 'tags')
        return { value: [...new Set([...conflict.localValue, ...conflict.remoteValue])] }
    },
  },
})
```

## Behavior

- `'lww'` (default): keep the stored value and call the `cacheConflict` hook.
- `'local-wins'`: keep the stored value silently.
- `'remote-wins'`: take the incoming value silently.
- Function: called per field; return `'local'`, `'remote'`, `{ value }`, or `undefined` (same as `'lww'`).

## Requirements

- A conflict exists only for equal stamps; different stamps are resolved by LWW.

## Pitfalls

1. Returning `undefined` from the function falls back to `'lww'` and fires `cacheConflict`.
