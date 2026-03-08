| name | description |
| --- | --- |
| `api-drizzle-config-path` | Reference for `rstoreDrizzle.drizzleConfigPath` |

# rstoreDrizzle.drizzleConfigPath

## Surface

Module option that locates the Drizzle config file.

## Syntax

```ts
rstoreDrizzle: {
  drizzleConfigPath: 'drizzle.config.ts',
}
```

## Behavior

- Defaults to `drizzle.config.ts`.
- Module setup is skipped with a warning when the file does not exist.

## Requirements

- File must exist and be importable with `jiti`.

## Pitfalls

1. Wrong path silently disables drizzle collection generation for the app.
