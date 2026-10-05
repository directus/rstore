| name | description |
| --- | --- |
| `api-custom-cache-write-metadata` | Reference for the `CustomCacheWriteMetadata` type augmentation |

# CustomCacheWriteMetadata

Type augmentation point declaring plugin-owned write metadata keys.

## Surface

Interface `CustomCacheWriteMetadata` in module `@rstore/shared`.

## Syntax

```ts
declare module '@rstore/shared' {
  interface CustomCacheWriteMetadata {
    etag?: string
  }
}
```

## Behavior

- Augmented keys type-check in `metadata` of cache writes, deletes and mutations, and in hook payloads.

## Requirements

- Augment `@rstore/shared`, not `@rstore/vue`.
- Make keys optional: writes without the key stay valid.

## Pitfalls

1. Declaring a key does not handle it; a `cacheBeforeWriteItem` / `cacheBeforeDeleteItem` handler must `consume()` it, or development warns.
