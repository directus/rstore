| name | description |
| --- | --- |
| `api-remove-collection` | Reference for `removeCollection(store, collectionName)` |

# removeCollection

## Surface

Removes a collection from store by name.

## Syntax

```ts
removeCollection(store, 'tasks')
```

## Behavior

- Clears collection cache entries.
- Removes collection from proxy name registry.

## Requirements

- Collection must exist.

## Pitfalls

1. Removing unknown collection names throws.
