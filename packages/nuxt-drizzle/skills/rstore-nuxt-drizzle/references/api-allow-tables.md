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
- Registers before hooks that throw `Collection "<name>" is not allowed.` when an unlisted collection is requested.
- Subsequent calls extend the existing allowed set; tables cannot be removed from the set at runtime.
- Default behavior with no call: all tables in the Drizzle schema are exposed. The first call to `allowTables` flips the default to deny-by-default for the rest of the server's lifetime.

## Requirements

- Call during server startup/plugin initialization before requests run.
- Recommended placement: a single dedicated Nitro plugin (e.g. `server/plugins/allowedTables.ts`) so the full allow-list is discoverable in one file.

## Pitfalls

1. Calling too late can expose endpoints before hooks are registered.
2. Adding a new Drizzle table to the schema does **not** automatically expose it once `allowTables` has been called. The new table must be added to the `allowTables([...])` list, or its generated endpoints will throw `Collection "<name>" is not allowed.`. This is the most common breakage when adding new tables to an existing project.
3. There is no "remove from allow-list" API; restricting access to a previously allowed table requires using `hooksForTable` with `*.before` hooks instead.
