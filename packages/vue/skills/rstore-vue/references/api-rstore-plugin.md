| name | description |
| --- | --- |
| `api-rstore-plugin` | Reference for Vue app plugin installation (`RstorePlugin`) |

# RstorePlugin

## Surface

Vue plugin installed with `{ store }`.

## Syntax

```ts
app.use(RstorePlugin, { store })
```

## Behavior

- Provides store through injection key used by `useStore()`.

## Requirements

- Pass a valid store instance.

## Pitfalls

1. Missing plugin install means `useStore()` falls back to active store or throws.
