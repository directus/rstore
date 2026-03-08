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

## Requirements

- Item key must be resolvable.

## Pitfalls

1. Missing key information causes update failures.
