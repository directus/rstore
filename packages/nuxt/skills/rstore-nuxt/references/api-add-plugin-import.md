| name | description |
| --- | --- |
| `api-add-plugin-import` | Reference for `addPluginImport(nuxt, importPath)` |

# addPluginImport

## Surface

Adds module import path merged into generated plugin template.

## Syntax

```ts
addPluginImport(nuxt, '#build/my-plugin')
```

## Behavior

- Uses internal `Set` for deduplication.
- Imported plugins become part of runtime store plugin list.

## Requirements

- Import must default-export a compatible plugin value.

## Pitfalls

1. Invalid exports can fail runtime plugin initialization.
