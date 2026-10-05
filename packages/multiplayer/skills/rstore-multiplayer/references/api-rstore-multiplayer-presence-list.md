| name | description |
| --- | --- |
| `api-rstore-multiplayer-presence-list` | Reference for the `<RstoreMultiplayerPresenceList>` component |

# RstoreMultiplayerPresenceList

Shows connected users (one per user) and the field they edit.

## Surface

`<RstoreMultiplayerPresenceList>` with props `user`, `peers`, `emptyLabel?`, `showField?` (default `true`).

## Syntax

```vue
<RstoreMultiplayerPresenceList :user="channel.user" :peers="channel.peers" />
```

## Behavior

- Renders one entry per user with their focused field.
- `showField: false` hides the field; `emptyLabel` is the optional empty-state label.

## Requirements

- Nuxt UI installed (`@nuxt/ui` module).

## Pitfalls

1. Pass the channel `peers` ref (the component groups per user), not `presenceUsers`.
