| name | description |
| --- | --- |
| `api-devtools-route` | Reference for devtools UI route setup (`/__rstore`) |

# Devtools Route (`/__rstore`)

## Surface

Nuxt devtools custom tab route configured by module devtools setup.

## Syntax

```ts
// route served/proxied at:
/__rstore
```

## Behavior

- Production-built client is served via `sirv` when available.
- Local dev mode proxies route to local devtools client server (port `3300`).

## Requirements

- Devtools integration is module-managed; avoid duplicate custom setup.

## Pitfalls

1. Manual conflicting proxy/route setup can break devtools tab rendering.
