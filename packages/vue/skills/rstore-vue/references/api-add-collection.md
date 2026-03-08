| name | description |
| --- | --- |
| `api-add-collection` | Reference for `addCollection(store, collection)` |

# addCollection

## Surface

Adds a collection to an existing store instance.

## Syntax

```ts
addCollection(store, withItemType<Task>().defineCollection({ name: 'tasks' }))
```

## Behavior

- Resolves collection defaults and relations.
- Updates store collection registry and name set.

## Requirements

- Collection name must not already exist.

## Pitfalls

1. Adding duplicate collection names throws.
