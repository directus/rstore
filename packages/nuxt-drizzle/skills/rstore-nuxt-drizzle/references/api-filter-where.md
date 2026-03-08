| name | description |
| --- | --- |
| `api-filter-where` | Reference for `filterWhere(item, condition, dialect)` |

# filterWhere

## Surface

Evaluates drizzle condition trees against local cached items.

## Syntax

```ts
const visible = filterWhere(item, eq('status', 'open'), dialect)
```

## Behavior

- Supports logical groups (`and`, `or`, `not`) and comparison operators.
- Handles SQL-like pattern operators (`like`, `ilike`, and negations).
- Uses case-insensitive regex for `like` in sqlite mode.

## Requirements

- Pass a valid `RstoreDrizzleCondition` and dialect string.

## Pitfalls

1. Unknown operators throw immediately and break cache-filtered query flows.
