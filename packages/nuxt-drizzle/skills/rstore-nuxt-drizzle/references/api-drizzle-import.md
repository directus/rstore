| name | description |
| --- | --- |
| `api-drizzle-import` | Reference for `rstoreDrizzle.drizzleImport` |

# rstoreDrizzle.drizzleImport

## Surface

Defines how generated server utils import the function that returns the Drizzle instance.

## Syntax

```ts
rstoreDrizzle: {
  drizzleImport: {
    name: 'useDrizzle',
    from: '~~/server/utils/drizzle',
  },
}
```

## Behavior

- Written into generated `$rstore-drizzle-server-utils.js`.
- Defaults to `{ name: 'useDrizzle', from: '~~/server/utils/drizzle' }`.

## Requirements

- Exported function must return a Drizzle database instance.

## Pitfalls

1. Name/path mismatch breaks all generated server handlers at runtime.
