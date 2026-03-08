| name | description |
| --- | --- |
| `api-define-relations` | Reference for `defineRelations(...)` |

# defineRelations

## Surface

Declares normalized relation mappings between collections.

## Syntax

```ts
defineRelations({
  posts: {
    author: { to: { users: { on: { id: 'userId' } } } },
  },
})
```

## Behavior

- Relations are normalized and used by include/relation fetch logic.
- Opposite relations are resolved during store setup/collection updates.

## Requirements

- Key mappings must match actual fields.

## Pitfalls

1. Incorrect `on` mapping causes relation fetch mismatches.
