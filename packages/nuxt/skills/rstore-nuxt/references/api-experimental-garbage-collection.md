| name | description |
| --- | --- |
| `api-experimental-garbage-collection` | Reference for `rstore.experimentalGarbageCollection` option |

# rstore.experimentalGarbageCollection

## Surface

Module option forwarded into store creation options.

## Syntax

```ts
rstore: {
  experimentalGarbageCollection: true,
}
```

## Behavior

- Stored in generated options template (`#build/$restore-options.ts`).
- Consumed by runtime `createStore(...)` call.

## Requirements

- Validate query behavior with GC-sensitive tests when enabling.

## Pitfalls

1. Enabling without validating query-tracking implications can change cache retention behavior.
