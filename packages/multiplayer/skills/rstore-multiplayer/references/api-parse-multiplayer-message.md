| name | description |
| --- | --- |
| `api-parse-multiplayer-message` | Reference for `parseMultiplayerMessage(raw, options?)` |

# parseMultiplayerMessage

Parses and validates one raw multiplayer frame.

## Surface

`parseMultiplayerMessage(raw, { onInvalid })` from `@rstore/multiplayer/protocol`.

## Syntax

```ts
import { parseMultiplayerMessage } from '@rstore/multiplayer/protocol'

const message = parseMultiplayerMessage(raw, {
  onInvalid: error => console.warn(error),
})
```

## Behavior

- Validates the frame against the protocol guards; `onInvalid` is called for invalid frames.

## Requirements

- Import from `@rstore/multiplayer/protocol`.

## Pitfalls

1. Replaces `validateMultiplayerMessage` from `@rstore/nuxt-multiplayer` `runtime/utils/*`.
