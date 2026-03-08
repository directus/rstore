| name | description |
| --- | --- |
| `api-delete` | Reference for collection `delete(keyOrItem, options?)` |

# delete

## Surface

Deletes one item by key or payload.

## Syntax

```ts
await store.todos.delete('1')
```

## Behavior

- Runs delete mutation hooks.
- Removes item from cache when applicable.

## Requirements

- Key must be resolvable from argument.

## Pitfalls

1. Passing partial items without key fields fails key resolution.
