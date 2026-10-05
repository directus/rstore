| name | description |
| --- | --- |
| `api-presence-set-text-cursor` | Reference for presence channel `setTextCursor(field, selection)` |

# channel.setTextCursor

Announces the local caret/selection in a text field.

## Surface

`channel.setTextCursor(field, { start, end, direction })`.

## Syntax

```ts
channel.setTextCursor('body', { start: 4, end: 4, direction: 'none' })
```

## Behavior

- Broadcasts the focused field and selection to the room; remote carets are rebased over text changes.

## Requirements

- Channel created with `createPresenceChannel` (or `useRstoreMultiplayerChannel` in Nuxt).

## Pitfalls

1. Send selection updates on cursor events (click, keyup, select), not only on focus.
