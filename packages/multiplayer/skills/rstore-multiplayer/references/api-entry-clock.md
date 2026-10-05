| name | description |
| --- | --- |
| `api-entry-clock` | Reference for the `@rstore/multiplayer/clock` entry |

# @rstore/multiplayer/clock

Hybrid Logical Clock (HLC) timestamps, usable without a store.

## Surface

Subpath `@rstore/multiplayer/clock`: `createHLCClock`, `compareHLC`, `stringifyHLC`, `parseHLC`.

## Syntax

```ts
import { compareHLC, createHLCClock, parseHLC, stringifyHLC } from '@rstore/multiplayer/clock'

// HLC string format used in fieldTimestamps / deletedAt: 'physicalHex:logicalHex:nodeId'
```

## Behavior

- Produces and compares the HLC stamps carried by `fieldTimestamps` and `deletedAt`.
- Former HLC helpers of `@rstore/core` moved here in v0.9.

## Requirements

- Stamps reaching the store go through `metadata`; the plugin compares them, not app code.

## Pitfalls

1. Importing HLC helpers from `@rstore/core` is the pre-0.9 path (kept during 0.9 where possible, removed in 0.10).
