| name | description |
| --- | --- |
| `api-rstore-multiplayer-text-cursor-overlay` | Reference for the `<RstoreMultiplayerTextCursorOverlay>` component |

# RstoreMultiplayerTextCursorOverlay

Draws remote carets and selections over a text input.

## Surface

`<RstoreMultiplayerTextCursorOverlay>` with props `field`, `peers`, `container` (positioned wrapper element), `target` (the input or textarea).

## Syntax

```vue
<RstoreMultiplayerTextCursorOverlay field="body" :peers="channel.peers" :container="wrapper" :target="textarea" />
```

## Behavior

- Renders remote carets and selections of `field` over `target` inside `container`.

## Requirements

- Client only.
- `container` must be a positioned wrapper element around `target`.
- Peers must share selections (`useRstoreMultiplayerTextField` or `setTextCursor`).

## Pitfalls

1. Rendering it during SSR is not supported; it is client only.
