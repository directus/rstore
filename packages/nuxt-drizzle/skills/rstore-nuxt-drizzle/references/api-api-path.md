| name | description |
| --- | --- |
| `api-api-path` | Reference for `rstoreDrizzle.apiPath` |

# rstoreDrizzle.apiPath

## Surface

Base route for generated CRUD handlers.

## Syntax

```ts
rstoreDrizzle: {
  apiPath: '/api/rstore',
}
```

## Behavior

- Defaults to `/api/rstore`.
- Registers `GET/POST /:collection` and `GET/PATCH/DELETE /:collection/:key`.
- Runtime plugin sends requests to this path.

## Requirements

- Route must be reachable from the Nuxt app runtime.

## Pitfalls

1. Changing this path without updating proxies/base URL assumptions causes 404s.
