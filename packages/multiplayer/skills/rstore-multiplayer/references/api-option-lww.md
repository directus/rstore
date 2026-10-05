| name | description |
| --- | --- |
| `api-option-lww` | Reference for `createMultiplayerPlugin({ lww })` |

# lww option

Enables or scopes field-level last-writer-wins merge and tombstones.

## Surface

`lww: boolean | { collections?, conflictPolicy? }` (default `true`).

## Syntax

```ts
createMultiplayerPlugin({ lww: false })
createMultiplayerPlugin({ lww: { collections: ['todos'] } })
createMultiplayerPlugin({ lww: { collections: collection => collection.name !== 'logs' } })
```

## Behavior

- `true`: LWW merge of stamped writes and tombstones of stamped deletes for all collections.
- `false`: disables both.
- `collections`: array of names or a function of the collection restricting LWW.
- `conflictPolicy`: see the `conflictPolicy` reference.

## Requirements

- Stamped writes must carry `metadata.fieldTimestamps` / `metadata.deletedAt`.

## Pitfalls

1. Collections outside `collections` get plain overwrites for stamped frames.
