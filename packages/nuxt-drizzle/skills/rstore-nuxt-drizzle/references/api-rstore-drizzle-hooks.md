| name | description |
| --- | --- |
| `api-rstore-drizzle-hooks` | Reference for `rstoreDrizzleHooks` |

# rstoreDrizzleHooks

## Surface

Global hook bus for generated REST handlers and realtime filtering.

## Syntax

```ts
rstoreDrizzleHooks.hook('index.get.before', ({ transformQuery }) => {
  transformQuery(({ where }) => {
    // add extra where constraints
  })
})
```

## Behavior

- Provides `index.*` and `item.*` before/after hooks plus `realtime.filter`.
- Before hooks can append query transforms through `transformQuery(...)`.
- After hooks can replace returned result through `setResult(...)`.

## Requirements

- Hook logic must stay deterministic and safe for all matching requests.

## Pitfalls

1. Heavy async hooks add latency to every matching API request.
