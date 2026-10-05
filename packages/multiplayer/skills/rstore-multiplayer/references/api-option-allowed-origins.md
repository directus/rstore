| name | description |
| --- | --- |
| `api-option-allowed-origins` | Reference for `rstoreMultiplayerServer.allowedOrigins` |

# rstoreMultiplayerServer.allowedOrigins

Origin check at WebSocket upgrade.

## Surface

`allowedOrigins: string[] | false` (default same origin only).

## Syntax

```ts
rstoreMultiplayerServer: { allowedOrigins: ['https://app.example.com'] }
```

## Behavior

- Extra origins accepted at upgrade; `false` disables the check.

## Requirements

- List every cross-origin client host.

## Pitfalls

1. Browsers do not apply CORS to WebSocket handshakes; `false` exposes the endpoint to cross-site WebSocket hijacking.
