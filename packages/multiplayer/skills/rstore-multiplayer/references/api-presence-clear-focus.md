| name | description |
| --- | --- |
| `api-presence-clear-focus` | Reference for presence channel `clearFocus(field)` |

# channel.clearFocus

Clears the local focused field.

## Surface

`channel.clearFocus(field)`.

## Syntax

```ts
channel.clearFocus('body')
```

## Behavior

- Ignores a delayed blur of a field that no longer has the focus.

## Requirements

- Pass the field that lost focus.

## Pitfalls

1. Behavior changed in v0.9: a blur arriving after focus moved to another field no longer clears the newer focus.
