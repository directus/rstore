| name | description |
| --- | --- |
| `api-codemod-multiplayer-0-9` | Reference for the `multiplayer-0.9.yml` ast-grep codemod |

# multiplayer-0.9 codemod

Rewrites 0.8 collaboration imports and cache options for 0.9.

## Surface

`multiplayer-0.9.yml` ast-grep rule file, downloaded from https://github.com/Akryum/rstore/blob/main/scripts/codemods/multiplayer-0.9.yml

## Syntax

```sh
pnpm dlx @ast-grep/cli scan -r multiplayer-0.9.yml --update-all src
```

## Behavior

- Moves HLC, LWW, text and tombstone helpers from `@rstore/core` to `@rstore/multiplayer/clock`, `/lww`, `/text`.
- Moves LWW, text and protocol types from `@rstore/shared` to `@rstore/multiplayer`, protocol guards to `@rstore/multiplayer/protocol`.
- Rewrites `writeItem({ fieldTimestamps })`, `deleteItem({ deletedAt })`, `applyMutation({ … })` to `metadata: { … }`.
- Removes `createStore({ tombstoneGc })` with a `TODO` comment (move it to `createMultiplayerPlugin({ tombstoneGc })`).
- Only reports `conflict.localTimestamp` / `remoteTimestamp` usages.

## Requirements

- Run your formatter afterwards (for example `eslint --fix`): moved names get one import statement each.

## Pitfalls

1. Only `.ts` files are scanned; Vue SFC script blocks must be migrated by hand.
2. The codemod does not install `createMultiplayerPlugin()`; add it to the store plugins.
