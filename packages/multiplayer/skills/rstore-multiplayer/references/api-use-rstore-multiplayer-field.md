| name | description |
| --- | --- |
| `api-use-rstore-multiplayer-field` | Reference for `useRstoreMultiplayerField(options)` |

# useRstoreMultiplayerField

Announces the focused field of any control (for example a select) to the room.

## Surface

`useRstoreMultiplayerField({ field, channel })` returning `onFocus`, `onBlur`.

## Syntax

```vue
<script setup lang="ts">
const status = useRstoreMultiplayerField({ field: 'status', channel })
</script>

<template>
  <select v-model="form.status" @focus="status.onFocus" @blur="status.onBlur" />
</template>
```

## Behavior

- Announces focus of the field; no selection is shared.
- The blur is applied after a tick, so moving focus between fields never shows the user idle.

## Requirements

- Bind `onFocus` / `onBlur` to the control.

## Pitfalls

1. Use `useRstoreMultiplayerTextField` for text inputs so the selection is shared too.
