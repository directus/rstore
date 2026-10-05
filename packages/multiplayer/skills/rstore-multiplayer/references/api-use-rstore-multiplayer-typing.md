| name | description |
| --- | --- |
| `api-use-rstore-multiplayer-typing` | Reference for `useRstoreMultiplayerTyping(channel, target)` |

# useRstoreMultiplayerTyping

Typing indicators for one record or field.

## Surface

`useRstoreMultiplayerTyping(channel, { collection, key, field? })` returning `typingUsers`, `onInput`, `onBlur`.

## Syntax

```ts
const typing = useRstoreMultiplayerTyping(channel, { collection: 'Document', key: props.id, field: 'body' })
// typing.typingUsers: peers typing there
// call typing.onInput() on input events, typing.onBlur() on blur
```

## Behavior

- `typingUsers`: peers typing on that target.
- Frames never carry the typed content.

## Requirements

- Call `onInput()` on input events and `onBlur()` on blur.

## Pitfalls

1. Do not send typed text through a custom channel message for indicators; the protocol rejects content in typing frames.
