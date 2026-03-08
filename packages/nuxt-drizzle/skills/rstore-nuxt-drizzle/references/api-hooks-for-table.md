| name | description |
| --- | --- |
| `api-hooks-for-table` | Reference for `hooksForTable(table, hooks)` |

# hooksForTable

## Surface

Registers table-scoped hook handlers without manual collection-name checks.

## Syntax

```ts
hooksForTable(users, {
  'index.get.before': ({ transformQuery }) => {
    transformQuery(({ where }) => {
      // tenant filter
    })
  },
})
```

## Behavior

- Resolves collection name from the Drizzle table reference.
- Internally attaches handlers to `rstoreDrizzleHooks`.
- Executes handler only when payload collection matches the table collection.

## Requirements

- Pass a table that exists in generated schema metadata.

## Pitfalls

1. Passing a table from a different schema instance will never match incoming requests.
