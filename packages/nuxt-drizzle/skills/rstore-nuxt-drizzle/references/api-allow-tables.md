| name | description |
| --- | --- |
| `api-allow-tables` | Reference for `allowTables(tables)` |

# allowTables

## Surface

Adds allow-list based collection access control for generated server endpoints.

## Syntax

```ts
allowTables([users, posts])
```

## Behavior

- Converts tables to generated collection names.
- Registers before hooks that throw when requested collection is not allowed.
- Subsequent calls extend the existing allowed set.

## Requirements

- Call during server startup/plugin initialization before requests run.

## Pitfalls

1. Calling too late can expose endpoints before hooks are registered.
