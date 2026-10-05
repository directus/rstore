| name | description |
| --- | --- |
| `api-update` | Reference for collection `update(item, options?)` |

# update

## Surface

Updates one item through mutation pipeline.

## Syntax

```ts
await store.todos.update({ id: '1', title: 'Updated' })
```

## Behavior

- Resolves target key from payload/options.
- Runs update hooks and writes result into cache.
- Accepts `options.formOperations` for advanced plugin-driven relation workflows.
- Accepts `options.metadata` (write metadata), exposed read-only to mutation hooks as `payload.metadata`.

## Requirements

- Item key must be resolvable.

## Pitfalls

1. Missing key information causes update failures.
