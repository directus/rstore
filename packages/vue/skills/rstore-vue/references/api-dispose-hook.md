| name | description |
| --- | --- |
| `api-dispose-hook` | Reference for the `dispose` plugin hook |

# dispose

Plugin cleanup when the store cache is disposed.

## Surface

`hook('dispose', () => void)` inside `definePlugin({ setup })`.

## Syntax

```ts
hook('dispose', () => {
  clearInterval(timer)
})
```

## Behavior

- Called once when `store.$cache.dispose()` runs.

## Requirements

- Stop timers and close channels started by the plugin here.

## Pitfalls

1. Timers started in `setup`/`init` without a `dispose` handler keep running after the store is gone.
