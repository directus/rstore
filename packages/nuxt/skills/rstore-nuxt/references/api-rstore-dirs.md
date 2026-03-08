| name | description |
| --- | --- |
| `api-rstore-dirs` | Reference for `rstore.rstoreDirs` module option |

# rstore.rstoreDirs

## Surface

Module option controlling scan roots for collections/plugins per Nuxt layer.

## Syntax

```ts
rstore: {
  rstoreDirs: ['rstore', 'domain/rstore'],
}
```

## Behavior

- Default is `['rstore']`.
- Scans `<dir>/*.{ts,js}` and `<dir>/plugins/*.{ts,js}` in each layer.

## Requirements

- Directories must exist in layer source roots.

## Pitfalls

1. Wrong directory paths silently lead to missing generated schema/plugins.
