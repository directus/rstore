| name | description |
| --- | --- |
| `api-text-field-merger` | Reference for `textFieldMerger` |

# textFieldMerger

Three-way text merger for form fields changed on both sides.

## Surface

`textFieldMerger` from `@rstore/multiplayer`, used as `createFormObject({ fieldMerge })`.

## Syntax

```ts
import { textFieldMerger } from '@rstore/multiplayer'

const form = createFormObject({
  defaultValues: () => ({ title: '', body: '' }),
  fieldMerge: textFieldMerger,
})
```

## Behavior

- Merges a string field changed locally and remotely when the edits do not overlap.
- Rewrites local `set` operations so undo/redo replay merged values.
- The plugin registers it on `formFieldMerge` when `formTextMerge` is on.

## Requirements

- Use directly only for standalone `createFormObject` forms.

## Pitfalls

1. Overlapping edits still produce `$conflicts` entries.
