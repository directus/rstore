| name | description |
| --- | --- |
| `api-is-origin-allowed` | Reference for `isOriginAllowed(origin, host, allowedOrigins)` |

# isOriginAllowed

Checks the `Origin` header of a WebSocket upgrade.

## Surface

`isOriginAllowed(origin, host, allowedOrigins)` from `@rstore/multiplayer/server`.

## Syntax

```ts
import { isOriginAllowed } from '@rstore/multiplayer/server'

if (!isOriginAllowed(origin, host, allowedOrigins))
  rejectUpgrade()
```

## Behavior

- Returns whether the upgrade origin is allowed for the host and extra allowed origins.

## Requirements

- Call it during the upgrade in custom servers; the Nuxt server module does it via `allowedOrigins`.

## Pitfalls

1. Browsers do not apply CORS to WebSocket handshakes; skipping the check allows cross-site WebSocket hijacking.
