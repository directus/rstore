| name | description |
| --- | --- |
| `api-option-ot` | Reference for `createMultiplayerPlugin({ ot })` |

# createMultiplayerPlugin({ ot })

Collections holding collab document blocks. Experimental: the API can change in a minor release; the manual IME checks on Safari macOS, iOS Safari and Android Gboard are pending.

## Surface

`createMultiplayerPlugin({ ot: { collections } })`; `collections` is an array of names or a function of the collection.

## Syntax

```ts
createMultiplayerPlugin({ ot: { collections: ['docNodes'] } })
```

## Behavior

- A write whose `version` is not newer than the cached row is dropped (recorded in the `multiplayer:ot` item metadata), so a realtime row frame never applies a change twice or overwrites a newer row.
- Field LWW does not apply to these collections; their field stamps are consumed.

## Requirements

- Rows must carry a numeric `version` (the `DocNodeRecord` field).

## Pitfalls

1. Do not mutate block rows with `create`/`update`/`delete`: edit through the collab client.
