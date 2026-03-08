| name | description |
| --- | --- |
| `api-add-collection-import` | Reference for `addCollectionImport(nuxt, importPath)` |

# addCollectionImport

## Surface

Adds module import path merged into generated collection template.

## Syntax

```ts
addCollectionImport(nuxt, '#build/my-collections')
```

## Behavior

- Uses internal `Set` for deduplication.
- Imported exports are merged into generated schema assembly.

## Requirements

- Import path must resolve during template generation.

## Pitfalls

1. Invalid path or non-schema exports break downstream runtime expectations.
