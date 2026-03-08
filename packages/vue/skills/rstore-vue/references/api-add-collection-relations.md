| name | description |
| --- | --- |
| `api-add-collection-relations` | Reference for `addCollectionRelations(store, relations)` |

# addCollectionRelations

## Surface

Adds relation definitions to an already-created store collection.

## Syntax

```ts
import { addCollectionRelations, defineRelations } from '@rstore/vue'

addCollectionRelations(store, defineRelations(posts, ({ collection }) => ({
  author: {
    to: collection(users, { on: { 'users.id': 'posts.userId' } }),
  },
})))
```

## Behavior

- Finds the target collection in `store.$collections` by name.
- Merges new relation entries into `collection.relations`.
- Throws if the target collection does not exist in the store.

## Requirements

- `relations.collection.name` must match a collection already registered in `store`.

## Pitfalls

1. Adding relations before the target collection exists throws immediately.
