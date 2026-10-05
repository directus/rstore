| name | description |
| --- | --- |
| `api-use-rstore-multiplayer-text-field` | Reference for `useRstoreMultiplayerTextField(options)` |

# useRstoreMultiplayerTextField

Announces focus and text selection of an input to the room.

## Surface

`useRstoreMultiplayerTextField({ field, channel })` returning `onFocus`, `onBlur`, `onCursorEvent`.

## Syntax

```vue
<script setup lang="ts">
const title = useRstoreMultiplayerTextField({ field: 'title', channel })
</script>

<template>
  <input
    v-model="form.title"
    @focus="title.onFocus"
    @blur="title.onBlur"
    @click="title.onCursorEvent"
    @keyup="title.onCursorEvent"
    @select="title.onCursorEvent"
  >
</template>
```

## Behavior

- Shares the focused field and selection (caret) with the room.
- The blur is applied after a tick, so moving focus between fields never shows the user idle.

## Requirements

- Bind `onCursorEvent` to click, keyup and select events.

## Pitfalls

1. Binding only focus/blur shares focus but not caret movement.
