| name | description |
| --- | --- |
| `api-option-form-text-merge` | Reference for `createMultiplayerPlugin({ formTextMerge })` |

# formTextMerge option

Automatic merge of non-overlapping concurrent text edits during form `$rebase`.

## Surface

`formTextMerge: boolean` (default `true`).

## Syntax

```ts
createMultiplayerPlugin({ formTextMerge: false })
```

## Behavior

- `true`: registers `textFieldMerger` on the `formFieldMerge` hook.
- A string field changed both locally and remotely is merged when edits do not overlap; overlapping edits stay `$conflicts` entries.

## Requirements

- Store forms only; standalone `createFormObject` forms use `fieldMerge: textFieldMerger`.

## Pitfalls

1. Nuxt + Drizzle installs the plugin with `formTextMerge: false`; set `ws.lww: false` and register your own plugin to get text merge there.
