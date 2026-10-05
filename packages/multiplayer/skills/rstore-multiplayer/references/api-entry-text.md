| name | description |
| --- | --- |
| `api-entry-text` | Reference for the `@rstore/multiplayer/text` entry |

# @rstore/multiplayer/text

Text diff, three-way merge and cursor rebasing, usable without a store.

## Surface

Subpath `@rstore/multiplayer/text`: `diffText`, `mergeText`, `rebaseTextRange`.

## Syntax

```ts
import { diffText, mergeText, rebaseTextRange } from '@rstore/multiplayer/text'
```

## Behavior

- Former text merge helpers of `@rstore/core` moved here in v0.9.

## Requirements

- For forms, prefer `textFieldMerger` or the plugin `formTextMerge` option.

## Pitfalls

1. Importing text helpers from `@rstore/core` is the pre-0.9 path (removed in 0.10).
