| name | description |
| --- | --- |
| `api-params-columns` | Reference for `params.columns` |

# params.columns

## Surface

Controls selected columns for list/item fetches.

## Syntax

```ts
await store.users.findMany({
  params: {
    columns: {
      id: true,
      email: true,
    },
  },
})
```

## Behavior

- Forwarded to server query builder as `q.columns`.
- Used by offline sync key existence checks to fetch only primary key columns.

## Requirements

- Requested columns must exist on the target table/model.

## Pitfalls

1. Omitting fields required by downstream UI logic can cause undefined reads.
