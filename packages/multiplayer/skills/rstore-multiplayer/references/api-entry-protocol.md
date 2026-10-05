| name | description |
| --- | --- |
| `api-entry-protocol` | Reference for the `@rstore/multiplayer/protocol` entry |

# @rstore/multiplayer/protocol

Wire frame types, guards and sanitization of `multiplayer:*` frames.

## Surface

Subpath `@rstore/multiplayer/protocol`.

## Syntax

```ts
import { parseMultiplayerMessage } from '@rstore/multiplayer/protocol'
```

## Behavior

- Protocol guards formerly in `@rstore/shared` moved here in v0.9; protocol types are exported from `@rstore/multiplayer`.
- Typing frames (`multiplayer:typing`) accept only a record target `{ collection, key, field? }`; any other key is rejected, so typed content never travels.

## Requirements

- Treat every incoming frame as untrusted and parse it through the guards.

## Pitfalls

1. Deep imports of `@rstore/nuxt-multiplayer` `runtime/utils/*` broke in v0.9; import from this entry instead.
